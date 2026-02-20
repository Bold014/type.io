const Database = require('better-sqlite3');
const path = require('path');

let db;

function getDB() {
  if (!db) {
    db = new Database(path.join(__dirname, '..', 'typeio.sqlite'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDB() {
  const conn = getDB();
  conn.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      rating INTEGER DEFAULT 1000,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      avg_wpm REAL DEFAULT 0,
      games_played INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function createUser(username, passwordHash) {
  const conn = getDB();
  const stmt = conn.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
  return stmt.run(username, passwordHash);
}

function findUserByUsername(username) {
  const conn = getDB();
  return conn.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function findUserById(id) {
  const conn = getDB();
  return conn.prepare('SELECT id, username, rating, wins, losses, avg_wpm, games_played FROM users WHERE id = ?').get(id);
}

function updateStats(userId, won, wpm) {
  const conn = getDB();
  const user = findUserById(userId);
  if (!user) return;

  const newGamesPlayed = user.games_played + 1;
  const newAvgWpm = ((user.avg_wpm * user.games_played) + wpm) / newGamesPlayed;
  const ratingDelta = won ? 25 : -25;
  const newRating = Math.max(0, user.rating + ratingDelta);

  conn.prepare(`
    UPDATE users SET
      wins = wins + ?,
      losses = losses + ?,
      avg_wpm = ?,
      games_played = ?,
      rating = ?
    WHERE id = ?
  `).run(won ? 1 : 0, won ? 0 : 1, newAvgWpm, newGamesPlayed, newRating, userId);

  return { ratingDelta, newRating };
}

module.exports = { initDB, getDB, createUser, findUserByUsername, findUserById, updateStats };
