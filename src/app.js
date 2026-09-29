require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const config = require('./config');
const db = require('./db');
const { extractPdfText } = require('./services/pdf');
const logger = require('./services/logger');
const { createLlmProvider } = require('./providers');
const { normalizeGenerationSettings } = require('./providers/generation-settings');
const { requireAuth } = require('./middleware/auth');
const authRoutes = require('./routes/auth');

fs.mkdirSync(config.uploadDir, { recursive: true });
const upload = multer({
  dest: config.uploadDir,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    callback(isPdf ? null : new Error('Please upload a PDF file.'), isPdf);
  }
});

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(session({
  name: 'lecturequiz.sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000 * 60 * 60 * 8 }
}));
app.use((req, res, next) => {
  res.locals.currentUser = req.session.username || null;
  next();
});
app.use(authRoutes);

app.get('/', (req, res) => res.redirect(req.session.userId ? '/dashboard' : '/login'));

app.get('/dashboard', requireAuth, (req, res) => {
  res.render('dashboard', {
    quizzes: db.listQuizzes(req.session.userId),
    collections: db.listCollections(req.session.userId)
  });
});

app.post('/collections', requireAuth, (req, res, next) => {
  const name = String(req.body.name || '').trim();
  if (!name || name.length > 50) return res.status(400).render('error', { message: 'Collection name must be 1–50 characters.' });
  try {
    db.createCollection(req.session.userId, name);
    res.redirect('/dashboard');
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).render('error', { message: 'You already have a collection with that name.' });
    next(error);
  }
});

app.post('/collections/:id/rename', requireAuth, (req, res, next) => {
  const name = String(req.body.name || '').trim();
  if (!name || name.length > 50) return res.status(400).render('error', { message: 'Collection name must be 1–50 characters.' });
  try {
    if (!db.renameCollection(req.params.id, req.session.userId, name)) return res.status(404).render('error', { message: 'Collection not found.' });
    res.redirect('/dashboard');
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).render('error', { message: 'You already have a collection with that name.' });
    next(error);
  }
});

app.post('/collections/:id/delete', requireAuth, (req, res) => {
  if (!db.deleteCollection(req.params.id, req.session.userId)) return res.status(404).render('error', { message: 'Collection not found.' });
  res.redirect('/dashboard');
});

app.post('/quizzes/:id/collection', requireAuth, (req, res) => {
  const collectionId = req.body.collectionId ? Number(req.body.collectionId) : null;
  if (!db.setQuizCollection(req.params.id, req.session.userId, collectionId)) return res.status(404).render('error', { message: 'Quiz or collection not found.' });
  res.redirect('/dashboard');
});

const emptyGeneratorValues = { title: '', questionCount: 5, difficulty: 'intermediate', questionTypes: ['multiple_choice'] };
app.get('/quizzes/new', requireAuth, (_req, res) => res.render('index', { error: null, values: emptyGeneratorValues }));

app.post('/quizzes', requireAuth, upload.single('lecture'), async (req, res) => {
  const file = req.file;
  const startedAt = Date.now();
  try {
    const requestedTypes = Array.isArray(req.body.questionTypes) ? req.body.questionTypes : [req.body.questionTypes].filter(Boolean);
    const settings = normalizeGenerationSettings({
      count: Number(req.body.questionCount), difficulty: req.body.difficulty, types: requestedTypes
    });
    const count = settings.count;
    const requestedTitle = String(req.body.title || '').trim();
    if (!file) throw new Error('Please choose a PDF lecture file.');
    if (!requestedTitle || requestedTitle.length > 100) {
      throw new Error('Give your quiz a title between 1 and 100 characters.');
    }
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      throw new Error('Choose between 1 and 20 questions.');
    }
    logger.log('upload_received', { userId: req.session.userId, filename: file.originalname, bytes: file.size, requestedQuestions: count });
    const text = await extractPdfText(file.path);
    logger.log('pdf_extracted', { userId: req.session.userId, characters: text.length, elapsedMs: Date.now() - startedAt });
    const signature = JSON.stringify({ difficulty: settings.difficulty, distribution: settings.distribution });
    const contentHash = crypto.createHash('sha256').update(text).update(signature).digest('hex');
    const existing = db.findQuizByMaterial(req.session.userId, contentHash) ||
      db.attachHashToLegacyQuiz(req.session.userId, file.originalname, contentHash);
    if (existing) {
      logger.log('saved_quiz_reused', { userId: req.session.userId, quizId: existing.id, elapsedMs: Date.now() - startedAt });
      return res.redirect(`/quizzes/${existing.id}?reused=1`);
    }
    const provider = createLlmProvider();
    logger.log('generation_started', { userId: req.session.userId, provider: config.llmProvider, model: config.llmProvider === 'ollama' ? config.ollama.model : config.huggingFace.model, inputCharacters: Math.min(text.length, config.maxPdfChars) });
    const questions = await provider.generateQuestions({
      text: text.slice(0, config.maxPdfChars),
      ...settings
    });
    logger.log('generation_completed', { userId: req.session.userId, generatedQuestions: questions.length, elapsedMs: Date.now() - startedAt });
    const quizId = db.createQuiz({
      userId: req.session.userId,
      title: requestedTitle,
      sourceFilename: file.originalname,
      contentHash,
      questions
    });
    logger.log('quiz_saved', { userId: req.session.userId, quizId, totalElapsedMs: Date.now() - startedAt });
    res.redirect(`/quizzes/${quizId}`);
  } catch (error) {
    logger.log('generation_failed', { userId: req.session.userId, message: error.message, elapsedMs: Date.now() - startedAt });
    res.status(400).render('index', {
      error: error.message,
      values: {
        title: String(req.body.title || ''), questionCount: req.body.questionCount || 5,
        difficulty: req.body.difficulty || 'intermediate',
        questionTypes: Array.isArray(req.body.questionTypes) ? req.body.questionTypes : [req.body.questionTypes].filter(Boolean)
      }
    });
  } finally {
    if (file) fs.promises.unlink(file.path).catch(() => {});
  }
});

app.post('/quizzes/:id/rename', requireAuth, (req, res) => {
  const title = String(req.body.title || '').trim();
  if (!title || title.length > 100) return res.status(400).render('error', { message: 'Quiz title must be 1–100 characters.' });
  if (!db.renameQuiz(req.params.id, req.session.userId, title)) {
    return res.status(404).render('error', { message: 'Quiz not found.' });
  }
  res.redirect('/dashboard');
});

app.post('/quizzes/:id/delete', requireAuth, (req, res) => {
  if (!db.deleteQuiz(req.params.id, req.session.userId)) {
    return res.status(404).render('error', { message: 'Quiz not found.' });
  }
  res.redirect('/dashboard');
});

app.get('/quizzes/:id', requireAuth, (req, res) => {
  const quiz = db.getQuiz(req.params.id, req.session.userId);
  if (!quiz) return res.status(404).render('error', { message: 'Quiz not found.' });
  res.render('quiz', { quiz, reused: req.query.reused === '1' });
});

app.post('/quizzes/:id/submit', requireAuth, (req, res) => {
  const quiz = db.getQuiz(req.params.id, req.session.userId);
  if (!quiz) return res.status(404).render('error', { message: 'Quiz not found.' });
  let score = 0;
  const normalizeAnswer = value => String(value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/g, '');
  const results = quiz.questions.map(question => {
    const raw = req.body[`question_${question.id}`];
    const isObjective = question.type === 'multiple_choice' || question.type === 'true_false';
    const selectedIndex = isObjective && raw !== undefined ? Number(raw) : null;
    const submittedAnswer = isObjective ? (question.options[selectedIndex] || '') : String(raw || '').trim();
    const isCorrect = isObjective
      ? selectedIndex === question.correct_index
      : normalizeAnswer(submittedAnswer) === normalizeAnswer(question.correct_answer);
    if (isCorrect) score += 1;
    return { ...question, selectedIndex, submittedAnswer, isCorrect };
  });
  db.saveAttempt(quiz.id, score, quiz.questions.length,
    Object.fromEntries(results.map(item => [item.id, item.submittedAnswer])));
  res.render('result', { quiz, results, score });
});

app.use((error, _req, res, _next) => {
  res.status(400).render('error', { message: error.message || 'Something went wrong.' });
});

module.exports = app;
