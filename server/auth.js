const bcrypt = require('bcrypt');
const { createUser, findUserByUsername, findUserById } = require('./db');

const SALT_ROUNDS = 10;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function setupAuthRoutes(app) {
  app.post('/api/signup', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
      if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Username must be 3-20 characters (letters, numbers, underscore)' });
      if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

      const existing = findUserByUsername(username);
      if (existing) return res.status(409).json({ error: 'Username already taken' });

      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      const result = createUser(username, hash);
      req.session.userId = result.lastInsertRowid;
      req.session.username = username;
      res.json({ username, id: result.lastInsertRowid });
    } catch (err) {
      console.error('Signup error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

      const user = findUserByUsername(username);
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return res.status(401).json({ error: 'Invalid credentials' });

      req.session.userId = user.id;
      req.session.username = user.username;
      res.json({ username: user.username, id: user.id, rating: user.rating, wins: user.wins, losses: user.losses, avg_wpm: user.avg_wpm });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get('/api/me', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    const user = findUserById(req.session.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json(user);
  });
}

module.exports = { setupAuthRoutes };
