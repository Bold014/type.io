const { supabase, findUserById, xpToLevel, getUserEquippedWithItems } = require('./db');
const matchmaking = require('./matchmaking');
const {
  createGame, startCountdown, handleTypingUpdate,
  handleRoundComplete, handleDisconnect, getGameBySocketId
} = require('./game');
const ascend = require('./ascend');

let roomCounter = 0;
const emoteLastSent = new Map();
const EMOTE_COOLDOWN_MS = 3000;

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

    socket.on('queue:join', async (data) => {
      if (!socket.data.username) {
        socket.emit('error:message', { message: 'Set a username first' });
        return;
      }

      const mode = data?.mode === 'ranked' ? 'ranked' : 'quick';
      if (mode === 'ranked' && !socket.data.userId) {
        socket.emit('error:message', { message: 'Must be logged in for ranked' });
        return;
      }

      if (mode === 'ranked') {
        const profile = await findUserById(socket.data.userId);
        if (!profile || xpToLevel(profile.xp || 0) < 5) {
          socket.emit('error:message', { message: 'Reach level 5 to unlock ranked' });
          return;
        }
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

    socket.on('emote:send', (data) => {
      const game = getGameBySocketId(socket.id);
      if (!game) return;
      const text = (data && data.text && String(data.text).trim()) || '';
      if (!text) return;
      const now = Date.now();
      const last = emoteLastSent.get(socket.id) || 0;
      if (now - last < EMOTE_COOLDOWN_MS) return;
      emoteLastSent.set(socket.id, now);
      socket.to(game.roomId).emit('emote:receive', {
        from: socket.data.username || 'Opponent',
        text: text.slice(0, 64)
      });
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

    socket.on('ascend:peek', () => {
      ascend.peekLobby(io, socket);
    });

    socket.on('ascend:peek:leave', () => {
      ascend.leavePeek(socket);
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

async function createMatch(io, player1, player2, mode) {
  roomCounter++;
  const roomId = `room_${roomCounter}_${Date.now()}`;

  player1.socket.join(roomId);
  player2.socket.join(roomId);

  const game = createGame(roomId, player1, player2, mode);

  const [p2Equipped, p1Equipped] = await Promise.all([
    player2.userId ? getUserEquippedWithItems(player2.userId) : Promise.resolve([]),
    player1.userId ? getUserEquippedWithItems(player1.userId) : Promise.resolve([])
  ]);

  player1.socket.emit('match:found', {
    opponent: player2.username,
    opponentRating: mode === 'ranked' ? player2.rating : null,
    opponentEquipped: p2Equipped || [],
    roomId
  });
  player2.socket.emit('match:found', {
    opponent: player1.username,
    opponentRating: mode === 'ranked' ? player1.rating : null,
    opponentEquipped: p1Equipped || [],
    roomId
  });

  setTimeout(() => startCountdown(io, game), 4000);
}

module.exports = { setupSocketHandlers };
