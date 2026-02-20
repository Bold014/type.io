const matchmaking = require('./matchmaking');
const {
  createGame, startCountdown, handleTypingUpdate,
  handleRoundComplete, handleDisconnect
} = require('./game');

let roomCounter = 0;

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    const session = socket.request.session;
    socket.data.userId = session?.userId || null;
    socket.data.username = null;
    socket.data.rating = 1000;

    socket.on('auth:set', (data) => {
      socket.data.username = data.username;
      socket.data.userId = data.userId || null;
      socket.data.rating = data.rating || 1000;
    });

    socket.on('queue:join', (data) => {
      if (!socket.data.username) {
        socket.emit('error:message', { message: 'Set a username first' });
        return;
      }

      const mode = data?.mode === 'ranked' ? 'ranked' : 'quick';
      if (mode === 'ranked' && !socket.data.userId) {
        socket.emit('error:message', { message: 'Must be logged in for ranked' });
        return;
      }

      const match = matchmaking.addToQueue(socket, mode);
      if (match) {
        createMatch(io, match[0], match[1], mode);
      } else {
        socket.emit('queue:waiting', { mode, position: matchmaking.getQueueSize(mode) });
      }
    });

    socket.on('queue:leave', () => {
      matchmaking.removeFromQueue(socket.id);
    });

    socket.on('typing:update', (data) => {
      const game = require('./game').getGameBySocketId(socket.id);
      if (game) handleTypingUpdate(io, game, socket.id, data);
    });

    socket.on('round:complete', (data) => {
      const game = require('./game').getGameBySocketId(socket.id);
      if (game) handleRoundComplete(io, game, socket.id, data);
    });

    socket.on('disconnect', () => {
      matchmaking.removeFromQueue(socket.id);
      handleDisconnect(io, socket.id);
    });
  });
}

function createMatch(io, player1, player2, mode) {
  roomCounter++;
  const roomId = `room_${roomCounter}_${Date.now()}`;

  player1.socket.join(roomId);
  player2.socket.join(roomId);

  const game = createGame(roomId, player1, player2, mode);

  player1.socket.emit('match:found', {
    opponent: player2.username,
    opponentRating: mode === 'ranked' ? player2.rating : null,
    roomId
  });
  player2.socket.emit('match:found', {
    opponent: player1.username,
    opponentRating: mode === 'ranked' ? player1.rating : null,
    roomId
  });

  setTimeout(() => startCountdown(io, game), 4000);
}

module.exports = { setupSocketHandlers };
