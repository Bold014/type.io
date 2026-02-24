const { pickSentencesForDuration } = require('./sentences');
const { findUserById, computeMoneyFromChars, CHAR_VALUE_UPGRADES, addCoins, addCharsTyped } = require('./db');

const RACE_MAX_PLAYERS = 8;
const RACE_WAIT_TIME_MS = 10000;
const RACE_COUNTDOWN_SEC = 3;
const BOT_TICK_MS = 200;
const DEFAULT_WPM = 60;

const BOT_NAMES = [
  'SwiftTyper', 'KeyMaster', 'QuickFingers', 'TypeStorm', 'FlashKeys',
  'NimbleHands', 'RapidType', 'KeyNinja', 'SpeedDemon', 'TypeWizard',
  'SilentKeys', 'ByteRunner', 'WordSmith', 'KeyWhiz', 'TypeRacer',
  'ClickClack', 'TurboType', 'SwiftKey', 'BlazeFinger', 'TypeShark',
  'KeyboardKid', 'WordWind', 'TypeJet', 'RushType', 'SnapKeys',
  'BoltTyper', 'VelocType', 'ZipFingers', 'DashType', 'StrikeKeys'
];

const activeRaces = new Map();
const socketToRace = new Map();
let raceIdCounter = 0;
let botIdCounter = 0;
let activeLobby = null;

// ---------------------------------------------------------------------------
// Bot generation
// ---------------------------------------------------------------------------

function getAvgWpmForPlayers(players) {
  const wpms = players.map(p => Math.max(p.avgWpm || 0, p.bestWpm || 0)).filter(w => w > 0);
  return wpms.length > 0 ? wpms.reduce((a, b) => a + b, 0) / wpms.length : DEFAULT_WPM;
}

function generateBots(count, avgWpm, usedNameSet) {
  let low, high;
  if (avgWpm < 40)       { low = 0.8;  high = 1.2; }
  else if (avgWpm < 80)  { low = 0.85; high = 1.35; }
  else                   { low = 0.9;  high = 1.4; }

  const used = new Set(usedNameSet || []);
  const bots = [];

  for (let i = 0; i < count; i++) {
    const multiplier = low + Math.random() * (high - low);
    const targetWpm = Math.max(20, Math.round(avgWpm * multiplier));

    let name;
    let tries = 0;
    do {
      name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
      tries++;
    } while (used.has(name) && tries < 50);
    used.add(name);

    botIdCounter++;
    bots.push({
      botId: `bot_${botIdCounter}`,
      username: name,
      targetWpm,
      pauseChance: targetWpm > avgWpm ? 0.02 : 0.05
    });
  }
  return bots;
}

function collectUsedNames(lobby) {
  const names = new Set();
  lobby.realPlayers.forEach(p => names.add(p.username));
  lobby.bots.forEach(b => names.add(b.username));
  return names;
}

// ---------------------------------------------------------------------------
// Lobby system – players see the track immediately and bots trickle in
// ---------------------------------------------------------------------------

function emitLobbyUpdate(io, lobby) {
  const players = [
    ...lobby.realPlayers.map(p => ({
      username: p.username, progress: 0, wpm: 0, finished: false
    })),
    ...lobby.bots.map(b => ({
      username: b.username, progress: 0, wpm: 0, finished: false
    }))
  ];
  io.to(lobby.roomId).emit('race:lobby_update', { players });
}

function joinQueue(io, socket) {
  if (socketToRace.has(socket.id)) return;
  if (activeLobby && activeLobby.realPlayers.find(p => p.socket.id === socket.id)) return;

  const player = {
    socket,
    username: socket.data.username,
    userId: socket.data.userId,
    rating: socket.data.rating,
    avgWpm: socket.data.avgWpm || 0,
    bestWpm: socket.data.bestWpm || 0,
    charValueLevel: socket.data.charValueLevel || 0
  };

  if (!activeLobby) {
    const roomId = `race_lobby_${Date.now()}`;
    activeLobby = {
      roomId,
      realPlayers: [player],
      bots: [],
      botTimers: [],
      waitTimer: null,
      startedAt: Date.now()
    };

    socket.join(roomId);
    socket.emit('race:queued', { position: 1 });
    emitLobbyUpdate(io, activeLobby);
    scheduleBotJoins(io);

    activeLobby.waitTimer = setTimeout(() => {
      if (activeLobby) finalizeLobby(io);
    }, RACE_WAIT_TIME_MS);
  } else {
    activeLobby.realPlayers.push(player);
    socket.join(activeLobby.roomId);
    socket.emit('race:queued', { position: activeLobby.realPlayers.length });
    emitLobbyUpdate(io, activeLobby);

    if (activeLobby.realPlayers.length + activeLobby.bots.length >= RACE_MAX_PLAYERS) {
      finalizeLobby(io);
    }
  }
}

function scheduleBotJoins(io) {
  if (!activeLobby) return;

  const avgWpm = getAvgWpmForPlayers(activeLobby.realPlayers);
  const targetTotal = 4 + Math.floor(Math.random() * 2); // 4-5
  const botCount = Math.max(2, targetTotal - activeLobby.realPlayers.length);
  const usedNames = collectUsedNames(activeLobby);
  const bots = generateBots(botCount, avgWpm, usedNames);

  bots.forEach((bot, i) => {
    const delay = 1500 + i * 1800 + Math.floor(Math.random() * 1000);
    const timer = setTimeout(() => {
      if (!activeLobby) return;
      if (activeLobby.realPlayers.length + activeLobby.bots.length >= RACE_MAX_PLAYERS) return;
      activeLobby.bots.push(bot);
      emitLobbyUpdate(io, activeLobby);
    }, delay);
    if (activeLobby) activeLobby.botTimers.push(timer);
  });
}

function finalizeLobby(io) {
  if (!activeLobby) return;
  const lobby = activeLobby;
  activeLobby = null;

  lobby.botTimers.forEach(t => clearTimeout(t));
  if (lobby.waitTimer) clearTimeout(lobby.waitTimer);

  if (lobby.realPlayers.length === 0) return;

  const avgWpm = getAvgWpmForPlayers(lobby.realPlayers);
  const total = lobby.realPlayers.length + lobby.bots.length;
  if (total < 3) {
    const needed = 3 - total + Math.floor(Math.random() * 2);
    const usedNames = collectUsedNames(lobby);
    lobby.bots.push(...generateBots(needed, avgWpm, usedNames));
  }

  startRace(io, lobby);
}

function leaveQueue(io, socketId) {
  if (!activeLobby) return;
  const idx = activeLobby.realPlayers.findIndex(p => p.socket.id === socketId);
  if (idx === -1) return;

  const player = activeLobby.realPlayers[idx];
  activeLobby.realPlayers.splice(idx, 1);
  try { player.socket.leave(activeLobby.roomId); } catch (_) {}

  if (activeLobby.realPlayers.length === 0) {
    activeLobby.botTimers.forEach(t => clearTimeout(t));
    if (activeLobby.waitTimer) clearTimeout(activeLobby.waitTimer);
    activeLobby = null;
  } else {
    emitLobbyUpdate(io, activeLobby);
  }
}

// ---------------------------------------------------------------------------
// Race lifecycle
// ---------------------------------------------------------------------------

function startRace(io, lobby) {
  raceIdCounter++;
  const raceId = `race_${raceIdCounter}_${Date.now()}`;
  const roomId = lobby.roomId;

  const sentenceData = pickSentencesForDuration(30);

  const racePlayers = [
    ...lobby.realPlayers.map(p => ({
      socketId: p.socket.id,
      username: p.username,
      userId: p.userId,
      charValueLevel: p.charValueLevel || 0,
      isBot: false,
      progress: 0,
      wpm: 0,
      finished: false,
      place: 0,
      finishTime: 0,
      charsTyped: 0,
      rewards: null
    })),
    ...lobby.bots.map(b => ({
      socketId: null,
      botId: b.botId,
      username: b.username,
      userId: null,
      isBot: true,
      targetWpm: b.targetWpm,
      pauseChance: b.pauseChance,
      progress: 0,
      wpm: 0,
      finished: false,
      place: 0,
      finishTime: 0,
      charsTyped: 0,
      _typedChars: 0
    }))
  ];

  const race = {
    id: raceId,
    roomId,
    sentence: sentenceData.text,
    source: sentenceData.source,
    players: racePlayers,
    startTime: null,
    finishedCount: 0,
    state: 'countdown',
    botInterval: null
  };

  activeRaces.set(raceId, race);

  lobby.realPlayers.forEach(p => {
    socketToRace.set(p.socket.id, raceId);
  });

  io.to(roomId).emit('race:joined', {
    raceId,
    players: race.players.map(p => ({
      username: p.username, progress: 0, wpm: 0, finished: false
    }))
  });

  io.to(roomId).emit('race:countdown', {
    sentence: race.sentence,
    source: race.source,
    seconds: RACE_COUNTDOWN_SEC
  });

  setTimeout(() => {
    if (race.state !== 'countdown') return;
    race.state = 'playing';
    race.startTime = Date.now();
    io.to(roomId).emit('race:start', {});
    startBotSimulation(io, race);
  }, RACE_COUNTDOWN_SEC * 1000);
}

// ---------------------------------------------------------------------------
// Bot simulation – bots advance every BOT_TICK_MS during the race
// ---------------------------------------------------------------------------

function startBotSimulation(io, race) {
  race.botInterval = setInterval(() => {
    if (race.state !== 'playing') {
      clearInterval(race.botInterval);
      race.botInterval = null;
      return;
    }

    const elapsedMin = (Date.now() - race.startTime) / 60000;
    let changed = false;

    for (const p of race.players) {
      if (!p.isBot || p.finished) continue;

      if (Math.random() < p.pauseChance) continue;

      const charsPerTick = (p.targetWpm * 5 / 60) * (BOT_TICK_MS / 1000);
      const jitter = 0.85 + Math.random() * 0.3;
      p._typedChars += charsPerTick * jitter;

      p.progress = Math.min(1, p._typedChars / race.sentence.length);
      p.wpm = elapsedMin > 0 ? Math.round((p._typedChars / 5) / elapsedMin) : 0;

      if (p.progress >= 1 && !p.finished) {
        race.finishedCount++;
        p.finished = true;
        p.place = race.finishedCount;
        p.progress = 1;
        p.finishTime = Date.now() - race.startTime;
      }
      changed = true;
    }

    if (changed) {
      broadcastUpdate(io, race);
      if (race.finishedCount >= race.players.length) {
        endRace(io, race);
      }
    }
  }, BOT_TICK_MS);
}

// ---------------------------------------------------------------------------
// Typing updates & completion
// ---------------------------------------------------------------------------

function handleTypingUpdate(io, socketId, data) {
  const raceId = socketToRace.get(socketId);
  if (!raceId) return;
  const race = activeRaces.get(raceId);
  if (!race || race.state !== 'playing') return;

  const player = race.players.find(p => p.socketId === socketId);
  if (!player || player.finished) return;

  player.progress = data.progress || 0;
  player.wpm = data.wpm || 0;

  broadcastUpdate(io, race);
}

function handleComplete(io, socketId, data) {
  const raceId = socketToRace.get(socketId);
  if (!raceId) return;
  const race = activeRaces.get(raceId);
  if (!race || race.state !== 'playing') return;

  const player = race.players.find(p => p.socketId === socketId);
  if (!player || player.finished) return;

  race.finishedCount++;
  player.finished = true;
  player.place = race.finishedCount;
  player.progress = 1;
  player.wpm = data.wpm || 0;
  player.charsTyped = data.charsTyped || 0;
  player.finishTime = Date.now() - race.startTime;

  if (player.userId && player.charsTyped > 0) {
    const charLevel = player.charValueLevel || 0;
    const upgrade = CHAR_VALUE_UPGRADES[charLevel] || CHAR_VALUE_UPGRADES[0];
    const coinsGained = computeMoneyFromChars(player.charsTyped, charLevel);
    player.rewards = { coinsGained, charsTyped: player.charsTyped, charValue: upgrade.value };
    awardRaceCoins(player.userId, player.charsTyped).catch(() => {});
  }

  broadcastUpdate(io, race);

  if (race.finishedCount >= race.players.length) {
    endRace(io, race);
  }
}

// ---------------------------------------------------------------------------
// Broadcasting & race end
// ---------------------------------------------------------------------------

function broadcastUpdate(io, race) {
  io.to(race.roomId).emit('race:update', {
    players: race.players.map(p => ({
      username: p.username,
      progress: p.progress,
      wpm: p.wpm,
      finished: p.finished,
      place: p.place
    }))
  });
}

function endRace(io, race) {
  race.state = 'finished';

  if (race.botInterval) {
    clearInterval(race.botInterval);
    race.botInterval = null;
  }

  const results = race.players
    .sort((a, b) => {
      if (a.finished && !b.finished) return -1;
      if (!a.finished && b.finished) return 1;
      return a.place - b.place;
    })
    .map(p => ({
      username: p.username,
      place: p.finished ? p.place : race.players.length,
      wpm: p.wpm,
      finishTime: p.finishTime,
      finished: p.finished
    }));

  race.players.forEach(p => {
    if (!p.socketId) return;
    const sock = io.sockets.sockets.get(p.socketId);
    if (!sock) return;
    sock.emit('race:finish', { results, rewards: p.rewards || null });
  });

  setTimeout(() => {
    race.players.forEach(p => {
      if (p.socketId) {
        const sock = io.sockets.sockets.get(p.socketId);
        if (sock) sock.leave(race.roomId);
        socketToRace.delete(p.socketId);
      }
    });
    activeRaces.delete(race.id);
  }, 5000);
}

// ---------------------------------------------------------------------------
// Disconnect & cleanup
// ---------------------------------------------------------------------------

function handleDisconnect(io, socketId) {
  leaveQueue(io, socketId);

  const raceId = socketToRace.get(socketId);
  if (!raceId) return;
  const race = activeRaces.get(raceId);
  if (!race) return;

  const player = race.players.find(p => p.socketId === socketId);
  if (player && !player.finished) {
    race.finishedCount++;
    player.finished = true;
    player.place = race.players.length;
    broadcastUpdate(io, race);
    if (race.finishedCount >= race.players.length) endRace(io, race);
  }
  socketToRace.delete(socketId);
}

// ---------------------------------------------------------------------------
// Coin rewards
// ---------------------------------------------------------------------------

async function awardRaceCoins(userId, charsTyped) {
  try {
    const user = await findUserById(userId);
    if (!user) return;
    const charLevel = user.char_value_level || 0;
    const coinsGained = computeMoneyFromChars(charsTyped, charLevel);
    if (coinsGained <= 0 && !charsTyped) return;
    await Promise.all([
      coinsGained > 0 ? addCoins(userId, coinsGained) : Promise.resolve(),
      charsTyped > 0 ? addCharsTyped(userId, charsTyped) : Promise.resolve()
    ]);
  } catch (err) {
    console.error('awardRaceCoins error:', err);
  }
}

function getQueueSize() {
  return activeLobby ? activeLobby.realPlayers.length : 0;
}

module.exports = { joinQueue, leaveQueue, handleTypingUpdate, handleComplete, handleDisconnect, getQueueSize };
