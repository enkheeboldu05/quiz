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
  res.render('dashboard', { quizzes: db.listQuizzes(req.session.userId) });
});

app.get('/quizzes/new', requireAuth, (_req, res) => res.render('index', { error: null }));

app.post('/quizzes', requireAuth, upload.single('lecture'), async (req, res) => {
  const file = req.file;
  const startedAt = Date.now();
  try {
    const count = Number(req.body.questionCount);
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
    const contentHash = crypto.createHash('sha256').update(text).digest('hex');
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
      count
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
    res.status(400).render('index', { error: error.message });
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
  const results = quiz.questions.map(question => {
    const raw = req.body[`question_${question.id}`];
    const selectedIndex = raw === undefined ? null : Number(raw);
    const isCorrect = selectedIndex === question.correct_index;
    if (isCorrect) score += 1;
    return { ...question, selectedIndex, isCorrect };
  });
  db.saveAttempt(quiz.id, score, quiz.questions.length,
    Object.fromEntries(results.map(item => [item.id, item.selectedIndex])));
  res.render('result', { quiz, results, score });
});

app.use((error, _req, res, _next) => {
  res.status(400).render('error', { message: error.message || 'Something went wrong.' });
});

module.exports = app;
