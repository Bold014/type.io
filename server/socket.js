const { supabase, findUserById } = require('./db');
const matchmaking = require('./matchmaking');
const {
  createGame, startCountdown, handleTypingUpdate,
  handleRoundComplete, handleDisconnect
} = require('./game');
const ascend = require('./ascend');

let roomCounter = 0;

function setupSocketHandlers(io) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user) {
          const profile = await findUserById(user.id);
          if (profile) {
            socket.data.userId = profile.id;
            socket.data.username = profile.username;
            socket.data.rating = profile.rating;
          }
        }
      } catch (_) {}
    }
    next();
  });

  io.on('connection', (socket) => {
    if (!socket.data.userId) {
      socket.data.userId = null;
      socket.data.username = null;
      socket.data.rating = 1000;
    }

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

    socket.on('ascend:join', () => {
      if (!socket.data.username) {
        socket.emit('error:message', { message: 'Set a username first' });
        return;
      }
      ascend.joinLobby(io, socket);
    });

    socket.on('ascend:leave', () => {
      ascend.leaveLobby(io, socket.id);
    });

    socket.on('ascend:typing', (data) => {
      const lobby = ascend.getLobbyBySocketId(socket.id);
      if (lobby) ascend.handleTypingUpdate(io, lobby, socket.id, data);
    });

    socket.on('ascend:sentence:complete', (data) => {
      const lobby = ascend.getLobbyBySocketId(socket.id);
      if (lobby) ascend.handleSentenceComplete(io, lobby, socket.id, data);
    });

    socket.on('disconnect', () => {
      matchmaking.removeFromQueue(socket.id);
      handleDisconnect(io, socket.id);
      ascend.handleDisconnect(io, socket.id);
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
