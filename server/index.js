const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const ConnectSQLite = require('connect-sqlite3')(session);
const path = require('path');
const { initDB } = require('./db');
const { setupAuthRoutes } = require('./auth');
const { setupSocketHandlers } = require('./socket');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);

const sessionMiddleware = session({
  store: new ConnectSQLite({ db: 'sessions.sqlite', dir: path.join(__dirname, '..') }),
  secret: process.env.SESSION_SECRET || 'typeduel-secret-key-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
});

app.use(express.json());
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, '..', 'public')));

initDB();
setupAuthRoutes(app);

const io = new Server(server, {
  connectionStateRecovery: { maxDisconnectionDuration: 10000 }
});

io.engine.use(sessionMiddleware);

setupSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`typeduel.io running on http://localhost:${PORT}`);
});
