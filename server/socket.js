const { supabase, findUserById, xpToLevel, getUserEquippedWithItems, deductCoinsSafe, addCoins, getUserBalance } = require('./db');
const matchmaking = require('./matchmaking');
const {
  createGame, startCountdown, handleTypingUpdate,
  handleRoundComplete, handleDisconnect, getGameBySocketId
} = require('./game');
const ascend = require('./ascend');
const duelBot = require('./duelBot');

let roomCounter = 0;
const emoteLastSent = new Map();
const EMOTE_COOLDOWN_MS = 3000;

const GLOBAL_CHAT_MAX = 50;
const GLOBAL_CHAT_COOLDOWN_MS = 2000;
const GLOBAL_CHAT_MAX_LEN = 200;
const globalChatHistory = [];
const globalChatLastSent = new Map();

const WAGER_MIN = 50;
const WAGER_MAX = 50000;
const WAGER_EXPIRY_MS = 60000;
const pendingWagers = new Map();
const playerWagers = new Map();
let wagerIdCounter = 0;
let lastWagerTipTime = 0;
const WAGER_TIP_INTERVAL_MS = 300000;

function setupSocketHandlers(io) {
  matchmaking.setOnBotMatch((player) => {
    const botPlayer = duelBot.createBotPlayer();
    createMatch(io, player, botPlayer, 'quick');
  });

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
            console.log('[SOCKET AUTH] Authenticated:', profile.username, '| userId:', profile.id, '| steam_id:', profile.steam_id || 'none');
          } else {
            console.warn('[SOCKET AUTH] Valid token but profile not found for user:', user.id);
          }
        } else if (error) {
          console.warn('[SOCKET AUTH] Token validation failed:', error.message);
        }
      } catch (err) {
        console.error('[SOCKET AUTH] Error during auth:', err.message);
      }
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

      if (!socket.data.userId) {
        console.warn('[QUEUE] Player joining without userId:', socket.data.username, '| mode:', mode, '| stats will NOT be tracked');
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

    socket.on('globalchat:join', () => {
      socket.join('global-chat');
      socket.emit('globalchat:history', globalChatHistory);
      emitWagerTip(io);
    });

    socket.on('globalchat:leave', () => {
      socket.leave('global-chat');
    });

    socket.on('globalchat:send', async (data) => {
      if (!socket.data.userId || !socket.data.username) return;
      const text = (data && data.text && String(data.text).trim()) || '';
      if (!text || text.length > GLOBAL_CHAT_MAX_LEN) return;

      const now = Date.now();
      const last = globalChatLastSent.get(socket.id) || 0;
      if (now - last < GLOBAL_CHAT_COOLDOWN_MS) return;
      globalChatLastSent.set(socket.id, now);

      if (text.startsWith('/wager')) {
        await handleWagerCommand(io, socket, text);
        return;
      }

      let equipped = [];
      try {
        equipped = await getUserEquippedWithItems(socket.data.userId) || [];
      } catch (_) {}

      const msg = {
        username: socket.data.username,
        equipped,
        text,
        timestamp: now
      };

      globalChatHistory.push(msg);
      if (globalChatHistory.length > GLOBAL_CHAT_MAX) {
        globalChatHistory.shift();
      }

      io.to('global-chat').emit('globalchat:message', msg);
    });

    socket.on('wager:accept', async (data) => {
      await handleWagerAccept(io, socket, data);
    });

    socket.on('wager:cancel', () => {
      const existingId = playerWagers.get(socket.data.userId);
      if (!existingId) return;
      const wager = pendingWagers.get(existingId);
      if (!wager) return;
      clearTimeout(wager.expiryTimer);
      pendingWagers.delete(existingId);
      playerWagers.delete(socket.data.userId);
      io.to('global-chat').emit('wager:expired', { wagerId: existingId });
    });

    socket.on('disconnect', () => {
      matchmaking.removeFromQueue(socket.id);
      handleDisconnect(io, socket.id);
      ascend.handleDisconnect(io, socket.id);
      globalChatLastSent.delete(socket.id);

      if (socket.data.userId) {
        const existingId = playerWagers.get(socket.data.userId);
        if (existingId) {
          const wager = pendingWagers.get(existingId);
          if (wager) clearTimeout(wager.expiryTimer);
          pendingWagers.delete(existingId);
          playerWagers.delete(socket.data.userId);
          io.to('global-chat').emit('wager:expired', { wagerId: existingId });
        }
      }
    });
  });
}

function emitWagerTip(io) {
  const now = Date.now();
  if (now - lastWagerTipTime < WAGER_TIP_INTERVAL_MS) return;
  let hasRecentWager = false;
  for (const w of pendingWagers.values()) {
    if (now - w.createdAt < WAGER_TIP_INTERVAL_MS) { hasRecentWager = true; break; }
  }
  if (hasRecentWager) return;
  lastWagerTipTime = now;
  io.to('global-chat').emit('globalchat:wager-tip', {
    text: 'Type /wager 500 to challenge anyone, or /wager 500 @username to challenge a specific player!'
  });
}

async function handleWagerCommand(io, socket, text) {
  const parts = text.split(/\s+/);
  if (parts.length < 2) {
    socket.emit('wager:error', { message: 'Usage: /wager <amount> or /wager <amount> @username' });
    return;
  }

  const amount = parseInt(parts[1], 10);
  if (isNaN(amount) || amount < WAGER_MIN || amount > WAGER_MAX) {
    socket.emit('wager:error', { message: `Wager must be between $${WAGER_MIN} and $${WAGER_MAX.toLocaleString()}` });
    return;
  }

  if (!socket.data.userId) {
    socket.emit('wager:error', { message: 'You must be logged in to wager' });
    return;
  }

  const game = getGameBySocketId(socket.id);
  if (game) {
    socket.emit('wager:error', { message: 'Cannot wager while in a match' });
    return;
  }

  if (playerWagers.has(socket.data.userId)) {
    socket.emit('wager:error', { message: 'You already have a pending wager. Wait for it to expire or cancel it.' });
    return;
  }

  const balance = await getUserBalance(socket.data.userId);
  if (balance < amount) {
    socket.emit('wager:error', { message: `Insufficient balance. You have $${balance.toLocaleString()}` });
    return;
  }

  let targetUsername = null;
  if (parts.length >= 3 && parts[2].startsWith('@')) {
    targetUsername = parts[2].slice(1);
    if (!targetUsername) {
      socket.emit('wager:error', { message: 'Invalid target username' });
      return;
    }
  }

  let equipped = [];
  try { equipped = await getUserEquippedWithItems(socket.data.userId) || []; } catch (_) {}

  wagerIdCounter++;
  const wagerId = `wager_${wagerIdCounter}_${Date.now()}`;

  const wager = {
    wagerId,
    challengerId: socket.data.userId,
    challengerSocketId: socket.id,
    challengerUsername: socket.data.username,
    challengerRating: socket.data.rating,
    amount,
    targetUsername: targetUsername || null,
    equipped,
    createdAt: Date.now(),
    expiryTimer: null
  };

  wager.expiryTimer = setTimeout(() => {
    pendingWagers.delete(wagerId);
    playerWagers.delete(socket.data.userId);
    io.to('global-chat').emit('wager:expired', { wagerId });
  }, WAGER_EXPIRY_MS);

  pendingWagers.set(wagerId, wager);
  playerWagers.set(socket.data.userId, wagerId);

  io.to('global-chat').emit('globalchat:wager', {
    wagerId,
    username: socket.data.username,
    equipped,
    amount,
    targetUsername: targetUsername || null,
    expiresAt: wager.createdAt + WAGER_EXPIRY_MS
  });
}

async function handleWagerAccept(io, socket, data) {
  if (!socket.data.userId || !socket.data.username) {
    socket.emit('wager:error', { message: 'You must be logged in to accept wagers' });
    return;
  }

  const wagerId = data && data.wagerId;
  if (!wagerId) return;

  const wager = pendingWagers.get(wagerId);
  if (!wager) {
    socket.emit('wager:error', { message: 'This wager has expired or was cancelled' });
    return;
  }

  if (wager.challengerId === socket.data.userId) {
    socket.emit('wager:error', { message: 'You cannot accept your own wager' });
    return;
  }

  if (wager.targetUsername && wager.targetUsername.toLowerCase() !== socket.data.username.toLowerCase()) {
    socket.emit('wager:error', { message: 'This wager is for a specific player' });
    return;
  }

  const game = getGameBySocketId(socket.id);
  if (game) {
    socket.emit('wager:error', { message: 'Cannot accept wager while in a match' });
    return;
  }

  if (playerWagers.has(socket.data.userId)) {
    socket.emit('wager:error', { message: 'You have a pending wager. Cancel it first.' });
    return;
  }

  clearTimeout(wager.expiryTimer);
  pendingWagers.delete(wagerId);
  playerWagers.delete(wager.challengerId);

  const challengerResult = await deductCoinsSafe(wager.challengerId, wager.amount);
  if (challengerResult === -1) {
    io.to('global-chat').emit('wager:expired', { wagerId });
    socket.emit('wager:error', { message: 'Challenger no longer has enough coins' });
    return;
  }

  const accepterResult = await deductCoinsSafe(socket.data.userId, wager.amount);
  if (accepterResult === -1) {
    await addCoins(wager.challengerId, wager.amount);
    socket.emit('wager:error', { message: `Insufficient balance. You need $${wager.amount.toLocaleString()}` });
    io.to('global-chat').emit('wager:expired', { wagerId });
    return;
  }

  const challengerSocket = io.sockets.sockets.get(wager.challengerSocketId);
  if (!challengerSocket || !challengerSocket.connected) {
    await addCoins(wager.challengerId, wager.amount);
    await addCoins(socket.data.userId, wager.amount);
    socket.emit('wager:error', { message: 'Challenger disconnected' });
    io.to('global-chat').emit('wager:expired', { wagerId });
    return;
  }

  io.to('global-chat').emit('wager:accepted', {
    wagerId,
    challengerUsername: wager.challengerUsername,
    accepterUsername: socket.data.username,
    amount: wager.amount
  });

  const player1 = {
    socket: challengerSocket,
    username: wager.challengerUsername,
    userId: wager.challengerId,
    rating: wager.challengerRating
  };
  const player2 = {
    socket: socket,
    username: socket.data.username,
    userId: socket.data.userId,
    rating: socket.data.rating
  };

  createWagerMatch(io, player1, player2, wager.amount);
}

async function createWagerMatch(io, player1, player2, wagerAmount) {
  roomCounter++;
  const roomId = `room_${roomCounter}_${Date.now()}`;

  player1.socket.join(roomId);
  player2.socket.join(roomId);

  const game = createGame(roomId, player1, player2, 'wager');
  game.wagerAmount = wagerAmount;

  const [p2Equipped, p1Equipped] = await Promise.all([
    player2.userId ? getUserEquippedWithItems(player2.userId) : Promise.resolve([]),
    player1.userId ? getUserEquippedWithItems(player1.userId) : Promise.resolve([])
  ]);

  player1.socket.emit('match:found', {
    opponent: player2.username,
    opponentRating: null,
    opponentEquipped: p2Equipped || [],
    roomId,
    wagerAmount
  });
  player2.socket.emit('match:found', {
    opponent: player1.username,
    opponentRating: null,
    opponentEquipped: p1Equipped || [],
    roomId,
    wagerAmount
  });

  setTimeout(() => startCountdown(io, game), 4000);
}

async function createMatch(io, player1, player2, mode) {
  roomCounter++;
  const roomId = `room_${roomCounter}_${Date.now()}`;

  console.log('[MATCH] Creating', mode, 'match:', player1.username, (player1.userId ? '(authed)' : '(NO AUTH)'), 'vs', player2.username, (player2.userId ? '(authed)' : '(NO AUTH)'), '| room:', roomId);

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
