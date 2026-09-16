const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { redirectIfAuthenticated } = require('../middleware/auth');

const router = express.Router();

router.get('/login', redirectIfAuthenticated, (_req, res) => {
  res.render('login', { error: null, values: {} });
});

router.post('/login', redirectIfAuthenticated, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = email && password ? db.findUserByEmail(email) : null;
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).render('login', { error: 'Invalid email or password.', values: { email } });
    }
    req.session.regenerate(error => {
      if (error) return next(error);
      req.session.userId = user.id;
      req.session.username = user.username;
      res.redirect('/dashboard');
    });
  } catch (error) { next(error); }
});

router.get('/signup', redirectIfAuthenticated, (_req, res) => {
  res.render('signup', { error: null, values: {} });
});

router.post('/signup', redirectIfAuthenticated, async (req, res, next) => {
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const values = { username, email };
  try {
    if (username.length < 2 || username.length > 40) return res.status(400).render('signup', { error: 'Username must be 2–40 characters.', values });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).render('signup', { error: 'Enter a valid email address.', values });
    if (password.length < 8) return res.status(400).render('signup', { error: 'Password must contain at least 8 characters.', values });
    const userId = db.createUser(username, email, await bcrypt.hash(password, 12));
    db.claimLegacyQuizzes(userId);
    req.session.regenerate(error => {
      if (error) return next(error);
      req.session.userId = userId;
      req.session.username = username;
      res.redirect('/dashboard');
    });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).render('signup', { error: 'That username or email is already registered.', values });
    next(error);
  }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('lecturequiz.sid');
    res.redirect('/login');
  });
});

module.exports = router;
