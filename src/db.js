const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
const db = new Database(config.databasePath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
  );
  CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    source_filename TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    options_json TEXT NOT NULL,
    correct_index INTEGER NOT NULL,
    explanation TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'multiple_choice',
    difficulty TEXT NOT NULL DEFAULT 'intermediate',
    correct_answer TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    answers_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add ownership metadata without discarding quizzes created by the earlier version.
const quizColumns = db.prepare('PRAGMA table_info(quizzes)').all().map(column => column.name);
if (!quizColumns.includes('user_id')) db.exec('ALTER TABLE quizzes ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
if (!quizColumns.includes('content_hash')) db.exec('ALTER TABLE quizzes ADD COLUMN content_hash TEXT');
if (!quizColumns.includes('question_count')) db.exec('ALTER TABLE quizzes ADD COLUMN question_count INTEGER');
if (!quizColumns.includes('collection_id')) db.exec('ALTER TABLE quizzes ADD COLUMN collection_id INTEGER');
const questionColumns = db.prepare('PRAGMA table_info(questions)').all().map(column => column.name);
if (!questionColumns.includes('type')) db.exec("ALTER TABLE questions ADD COLUMN type TEXT NOT NULL DEFAULT 'multiple_choice'");
if (!questionColumns.includes('difficulty')) db.exec("ALTER TABLE questions ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'intermediate'");
if (!questionColumns.includes('correct_answer')) db.exec("ALTER TABLE questions ADD COLUMN correct_answer TEXT NOT NULL DEFAULT ''");
if (!questionColumns.includes('source')) db.exec("ALTER TABLE questions ADD COLUMN source TEXT NOT NULL DEFAULT ''");
db.exec(`
  UPDATE questions
  SET correct_answer = json_extract(options_json, '$[' || correct_index || ']')
  WHERE correct_answer = '' AND correct_index >= 0;
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_quizzes_user_id ON quizzes(user_id);
  CREATE INDEX IF NOT EXISTS idx_quizzes_collection_id ON quizzes(collection_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_quizzes_user_material
    ON quizzes(user_id, content_hash) WHERE user_id IS NOT NULL AND content_hash IS NOT NULL;
`);
db.exec(`
  UPDATE quizzes
  SET question_count = (SELECT COUNT(*) FROM questions WHERE questions.quiz_id = quizzes.id)
  WHERE question_count IS NULL;
`);

function createQuiz({ userId, title, sourceFilename, contentHash, questions }) {
  return db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO quizzes (user_id, title, source_filename, content_hash, question_count) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, title, sourceFilename, contentHash, questions.length);
    const insert = db.prepare(`
      INSERT INTO questions
        (quiz_id, position, prompt, options_json, correct_index, explanation, type, difficulty, correct_answer, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    questions.forEach((q, index) => insert.run(
      result.lastInsertRowid, index + 1, q.question,
      JSON.stringify(q.options), q.correctIndex ?? -1, q.explanation || '', q.type || 'multiple_choice',
      q.difficulty || 'intermediate', q.correctAnswer || '', q.source || ''
    ));
    return Number(result.lastInsertRowid);
  })();
}

function getQuiz(id, userId) {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ? AND user_id = ?').get(id, userId);
  if (!quiz) return null;
  quiz.questions = db.prepare(
    'SELECT * FROM questions WHERE quiz_id = ? ORDER BY position'
  ).all(id).map(row => ({ ...row, options: JSON.parse(row.options_json) }));
  return quiz;
}

function saveAttempt(quizId, score, total, answers) {
  const result = db.prepare(`
    INSERT INTO attempts (quiz_id, score, total, answers_json) VALUES (?, ?, ?, ?)
  `).run(quizId, score, total, JSON.stringify(answers));
  return Number(result.lastInsertRowid);
}

function findQuizByMaterial(userId, contentHash) {
  return db.prepare('SELECT id FROM quizzes WHERE user_id = ? AND content_hash = ?').get(userId, contentHash);
}

function attachHashToLegacyQuiz(userId, sourceFilename, contentHash) {
  const legacy = db.prepare(`
    SELECT id FROM quizzes
    WHERE user_id = ? AND source_filename = ? AND content_hash IS NULL
    ORDER BY id DESC LIMIT 1
  `).get(userId, sourceFilename);
  if (!legacy) return null;
  db.prepare('UPDATE quizzes SET content_hash = ? WHERE id = ? AND user_id = ?')
    .run(contentHash, legacy.id, userId);
  return legacy;
}

function listQuizzes(userId) {
  return db.prepare(`
    SELECT q.*, COUNT(a.id) AS attempt_count, MAX(a.score) AS best_score,
      MAX(a.created_at) AS last_attempt_at
    FROM quizzes q
    LEFT JOIN attempts a ON a.quiz_id = q.id
    WHERE q.user_id = ?
    GROUP BY q.id
    ORDER BY q.created_at DESC, q.id DESC
  `).all(userId);
}

function listCollections(userId) {
  return db.prepare(`
    SELECT c.*, COUNT(q.id) AS quiz_count
    FROM collections c LEFT JOIN quizzes q ON q.collection_id = c.id
    WHERE c.user_id = ? GROUP BY c.id ORDER BY c.name COLLATE NOCASE
  `).all(userId);
}

function createCollection(userId, name) {
  return Number(db.prepare('INSERT INTO collections (user_id, name) VALUES (?, ?)').run(userId, name).lastInsertRowid);
}

function renameCollection(id, userId, name) {
  return db.prepare('UPDATE collections SET name = ? WHERE id = ? AND user_id = ?').run(name, id, userId).changes;
}

function deleteCollection(id, userId) {
  return db.transaction(() => {
    const owned = db.prepare('SELECT id FROM collections WHERE id = ? AND user_id = ?').get(id, userId);
    if (!owned) return 0;
    db.prepare('UPDATE quizzes SET collection_id = NULL WHERE collection_id = ? AND user_id = ?').run(id, userId);
    return db.prepare('DELETE FROM collections WHERE id = ? AND user_id = ?').run(id, userId).changes;
  })();
}

function setQuizCollection(quizId, userId, collectionId) {
  if (collectionId !== null) {
    const collection = db.prepare('SELECT id FROM collections WHERE id = ? AND user_id = ?').get(collectionId, userId);
    if (!collection) return 0;
  }
  return db.prepare('UPDATE quizzes SET collection_id = ? WHERE id = ? AND user_id = ?')
    .run(collectionId, quizId, userId).changes;
}

function createUser(username, email, passwordHash) {
  const result = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
    .run(username, email, passwordHash);
  return Number(result.lastInsertRowid);
}

function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function claimLegacyQuizzes(userId) {
  return db.prepare('UPDATE quizzes SET user_id = ? WHERE user_id IS NULL').run(userId).changes;
}

function renameQuiz(id, userId, title) {
  return db.prepare('UPDATE quizzes SET title = ? WHERE id = ? AND user_id = ?')
    .run(title, id, userId).changes;
}

function deleteQuiz(id, userId) {
  return db.prepare('DELETE FROM quizzes WHERE id = ? AND user_id = ?')
    .run(id, userId).changes;
}

module.exports = {
  createQuiz, getQuiz, saveAttempt, findQuizByMaterial, attachHashToLegacyQuiz, listQuizzes,
  createUser, findUserByEmail, claimLegacyQuizzes, renameQuiz, deleteQuiz
  , listCollections, createCollection, renameCollection, deleteCollection, setQuizCollection
};
