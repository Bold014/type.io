const { pickSentencesForTier } = require('./sentences');
const { updateXpOnly, saveAscendRun } = require('./db');

const COUNTDOWN_SECONDS = 3;
const COMBO_THRESHOLD = 20;
const TICK_MS = 200;
const MAX_HP = 100;
const IDLE_THRESHOLD_MS = 5000;
const LOBBY_EMPTY_TIMEOUT_MS = 30000;

const TIER_THRESHOLDS = [0, 50, 150, 300, 450, 650, 850, 1100, 1350, 1650];

const MOMENTUM_THRESHOLDS = [20, 45, 75, 110, 150, 200, 260, 330, 410, 500];

const FLOOR_BASE_SPEED = 0.5;
const FLOOR_HEIGHT_FACTOR = 0.015;
const FLOOR_GRACE_PERIOD_MS = 10000;
const FLOOR_MAX_SPEED = 5.0;

const BOT_INITIAL_MIN = 10;
const BOT_INITIAL_MAX = 20;
const BOT_RETIRE_AT_REAL_PLAYERS = 10;
const BOT_WPM_MIN = 30;
const BOT_WPM_MAX = 95;
const BOT_ERROR_CHANCE = 0.03;

const BOT_NAMES = [
  'liam', 'ava', 'noah', 'olivia', 'ethan', 'sophia', 'mason', 'isabella',
  'lucas', 'mia', 'randomguy', 'pixelpancake', 'nightowl', 'coffeeaddict',
  'tinyfrog', 'fastfingers', 'keyboardhero', 'stormrunner', 'ghosttoast',
  'rainyday', 'moonwalker', 'hyperpotato', 'snackbandit', 'voidwalker',
  'spicynugget', 'bananabread', 'lostinspace', 'epicpotato', 'sneakycat',
  'neontiger', 'justvibing', 'tinydragon', 'electricgoose', 'megamind',
  'nightshift', 'darkmatter', 'hyperdrive', 'lasershark', 'tinyrobot',
  'stormchaser', 'ghostnoodles', 'supernova', 'pixelwizard', 'randomhero',
  'megachicken', 'midnightsnack', 'speedrunner', 'tinywizard', 'cosmicbanana',
  'bananaenjoyer', 'keyboardninja', 'silentstorm', 'chaoticenergy',
  'stormbreaker', 'voidninja', 'pixelknight', 'sleepycoder', 'turbotoaster',
  'electricpanda', 'shadowhunter', 'fastbooster', 'cheeseoverlord',
  'turbofalcon', 'bananaknight', 'stormrunner77', 'keyboardsmash',
  'nightcoder', 'coffeelover99', 'tinypenguin', 'mysterybox',
  'randompenguin', 'pixelghost', 'mooncheese', 'rainrunner', 'ghostrider',
  'speedydude', 'lazywizard', 'tinyhamster', 'electricstorm', 'cosmicwizard',
  'shadowblade', 'darkphoenix', 'ultrainstinct', 'TurboTurtle', 'SpeedDemon',
  'PixelSamurai', 'ChaosWizard', 'LaserFalcon', 'SilentEcho', 'MegaMind',
  'StormRunnerX', 'NeonPhantom', 'ShadowNinja', 'HyperNova', 'GhostHunter',
  'IronVelocity', 'RapidPulse'
];

const GARBAGE_WORDS = [
  'the', 'and', 'but', 'from', 'with', 'over', 'just',
  'also', 'very', 'each', 'more', 'some', 'only', 'into'
];

const lobbies = new Map();
let activeLobby = null;
let lobbyCounter = 0;

function getTier(height) {
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (height >= TIER_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

function pickGarbageWord() {
  return GARBAGE_WORDS[Math.floor(Math.random() * GARBAGE_WORDS.length)];
}

function pickAttackType(attackCount) {
  if (attackCount % 2 === 1) return 'inject';
  return Math.random() < 0.5 ? 'scramble' : 'chaos';
}

function getOrCreateLobby() {
  if (activeLobby) {
    return activeLobby;
  }

  lobbyCounter++;
  const lobbyId = `ascend_${lobbyCounter}_${Date.now()}`;
  const lobby = {
    lobbyId,
    players: new Map(),
    gameLoop: null,
    emptyTimer: null,
    initialBotCount: 0,
    playerCount() {
      let count = 0;
      this.players.forEach(p => { if (!p.eliminated) count++; });
      return count;
    }
  };
  lobbies.set(lobbyId, lobby);
  activeLobby = lobby;
  return lobby;
}

function createBotSocket(botId, username) {
  return {
    id: botId,
    data: { username, userId: null },
    emit() {},
    join() {},
    leave() {}
  };
}

function spawnBots(io, lobby) {
  const count = BOT_INITIAL_MIN + Math.floor(Math.random() * (BOT_INITIAL_MAX - BOT_INITIAL_MIN + 1));
  lobby.initialBotCount = count;

  const shuffled = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  const names = shuffled.slice(0, count);

  const botIds = [];

  for (let i = 0; i < count; i++) {
    const botId = `bot_${lobby.lobbyId}_${i}`;
    const username = names[i];
    const botSocket = createBotSocket(botId, username);
    const wpm = BOT_WPM_MIN + Math.floor(Math.random() * (BOT_WPM_MAX - BOT_WPM_MIN + 1));

    const player = {
      socket: botSocket,
      username,
      userId: null,
      height: 0,
      momentum: 1,
      momentumProgress: 0,
      momentumDecayPause: 0,
      hp: MAX_HP,
      tier: 1,
      currentSentence: null,
      currentSentenceSource: null,
      sentenceStartTime: null,
      comboState: { lastPosition: 0, lastErrors: 0, comboChars: 0, attackCount: 0 },
      injectedRanges: [],
      lastTypingState: null,
      lastActivityTime: Date.now(),
      eliminated: false,
      finalHeight: 0,
      finalTier: 0,
      startTime: null,
      knockouts: 0,
      floorHeight: 0,
      started: false,
      isBot: true,
      botWpm: wpm,
      botTypedPosition: 0,
      botErrors: 0
    };

    lobby.players.set(botId, player);
    botIds.push(botId);
  }

  let countdownLeft = COUNTDOWN_SECONDS;
  const interval = setInterval(() => {
    countdownLeft--;
    if (countdownLeft <= 0) {
      clearInterval(interval);
      for (const botId of botIds) {
        const bot = lobby.players.get(botId);
        if (bot && !bot.eliminated) {
          startPlayerRun(io, lobby, botId);
        }
      }
    }
  }, 1000);
}

function retireBots(io, lobby) {
  if (lobby.initialBotCount === 0) return;

  let realCount = 0;
  lobby.players.forEach(p => {
    if (!p.isBot && !p.eliminated) realCount++;
  });

  let targetBots;
  if (realCount >= BOT_RETIRE_AT_REAL_PLAYERS) {
    targetBots = 0;
  } else {
    targetBots = Math.max(0, Math.round(
      lobby.initialBotCount * (1 - (realCount - 1) / (BOT_RETIRE_AT_REAL_PLAYERS - 1))
    ));
  }

  const aliveBots = [];
  lobby.players.forEach((p, sid) => {
    if (p.isBot && !p.eliminated) aliveBots.push({ sid, height: p.height });
  });

  const toRemove = aliveBots.length - targetBots;
  if (toRemove <= 0) return;

  aliveBots.sort((a, b) => a.height - b.height);
  for (let i = 0; i < toRemove; i++) {
    eliminatePlayer(io, lobby, aliveBots[i].sid, null);
  }
}

function tickBots(io, lobby, dt) {
  lobby.players.forEach((player, socketId) => {
    if (!player.isBot || player.eliminated || !player.started || !player.currentSentence) return;

    const charsPerSecond = (player.botWpm * 5) / 60;
    player.botTypedPosition += charsPerSecond * dt;

    if (Math.random() < BOT_ERROR_CHANCE) {
      player.botErrors++;
    }

    const newPos = Math.min(Math.floor(player.botTypedPosition), player.currentSentence.length);
    const jitter = Math.floor(Math.random() * 11) - 5;

    handleTypingUpdate(io, lobby, socketId, {
      position: newPos,
      typed: player.currentSentence.substring(0, newPos),
      wpm: Math.max(1, player.botWpm + jitter),
      errors: player.botErrors,
      corrections: 0
    });

    if (player.eliminated) return;

    if (newPos >= player.currentSentence.length) {
      handleSentenceComplete(io, lobby, socketId, {
        typed: player.currentSentence,
        wpm: player.botWpm,
        corrections: 0,
        time: Date.now() - (player.sentenceStartTime || Date.now())
      });
      player.botTypedPosition = 0;
      player.botErrors = 0;
    }
  });
}

function joinLobby(io, socket) {
  const existing = getLobbyBySocketId(socket.id);
  if (existing) return;

  const lobby = getOrCreateLobby();

  if (lobby.emptyTimer) {
    clearTimeout(lobby.emptyTimer);
    lobby.emptyTimer = null;
  }

  const player = {
    socket,
    username: socket.data.username,
    userId: socket.data.userId,
    height: 0,
    momentum: 1,
    momentumProgress: 0,
    momentumDecayPause: 0,
    hp: MAX_HP,
    tier: 1,
    currentSentence: null,
    currentSentenceSource: null,
    sentenceStartTime: null,
    comboState: { lastPosition: 0, lastErrors: 0, comboChars: 0, attackCount: 0 },
    injectedRanges: [],
    lastTypingState: null,
    lastActivityTime: Date.now(),
    eliminated: false,
    finalHeight: 0,
    finalTier: 0,
    startTime: null,
    knockouts: 0,
    floorHeight: 0,
    started: false
  };

  lobby.players.set(socket.id, player);
  socket.join(lobby.lobbyId);

  if (lobby.initialBotCount === 0) {
    spawnBots(io, lobby);
  } else {
    retireBots(io, lobby);
  }

  const currentScoreboard = buildScoreboard(lobby);
  socket.emit('ascend:joined', { scoreboard: currentScoreboard });

  socket.emit('ascend:countdown', { seconds: COUNTDOWN_SECONDS });

  let count = COUNTDOWN_SECONDS;
  const interval = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(interval);
      startPlayerRun(io, lobby, socket.id);
    }
  }, 1000);

  if (!lobby.gameLoop) {
    lobby.gameLoop = setInterval(() => {
      tickGameLoop(io, lobby);
    }, TICK_MS);
  }
}

function startPlayerRun(io, lobby, socketId) {
  const player = lobby.players.get(socketId);
  if (!player || player.eliminated) return;

  const now = Date.now();
  player.startTime = now;
  player.lastActivityTime = now;
  player.started = true;

  const sentenceData = prepareSentence(lobby, socketId);

  player.socket.emit('ascend:start', {
    startTime: now,
    sentence: sentenceData.sentence,
    source: sentenceData.source,
    tier: sentenceData.tier,
    height: sentenceData.height,
    hp: sentenceData.hp,
    momentum: sentenceData.momentum
  });
}

function prepareSentence(lobby, socketId) {
  const player = lobby.players.get(socketId);
  if (!player) return null;

  const tier = getTier(player.height);
  player.tier = tier;

  const sentenceObj = pickSentencesForTier(tier);
  player.currentSentence = sentenceObj.text;
  player.currentSentenceSource = sentenceObj.source;
  player.sentenceStartTime = Date.now();
  player.comboState = { lastPosition: 0, lastErrors: 0, comboChars: 0, attackCount: player.comboState.attackCount };
  player.injectedRanges = [];
  player.lastTypingState = null;

  return {
    sentence: sentenceObj.text,
    source: sentenceObj.source,
    tier: player.tier,
    height: Math.round(player.height * 10) / 10,
    hp: Math.round(player.hp),
    momentum: player.momentum
  };
}

function assignSentence(io, lobby, socketId) {
  const data = prepareSentence(lobby, socketId);
  if (!data) return;

  const player = lobby.players.get(socketId);
  player.socket.emit('ascend:sentence', data);
}

function tickGameLoop(io, lobby) {
  const now = Date.now();
  const dt = TICK_MS / 1000;

  tickBots(io, lobby, dt);

  let aliveCount = 0;

  lobby.players.forEach((player, socketId) => {
    if (player.eliminated || !player.started) return;
    aliveCount++;

    player.height += player.momentum * 0.25 * dt;

    const newTier = getTier(player.height);
    if (newTier > player.tier) {
      player.tier = newTier;
      player.socket.emit('ascend:tier', { tier: newTier, height: Math.round(player.height * 10) / 10 });
    }

    if (player.momentumDecayPause > 0) {
      player.momentumDecayPause -= TICK_MS;
    } else if (player.momentum > 1) {
      const decayRate = 0.3 + (player.momentum - 1) * 0.15;
      player.momentumProgress -= decayRate * dt;
      if (player.momentumProgress < 0) {
        player.momentumProgress = 0;
        if (player.momentum > 1) {
          player.momentum--;
          player.momentumProgress = MOMENTUM_THRESHOLDS[player.momentum - 1] * 0.5;
        }
      }
    }

    const hpBefore = player.hp;

    const idle = now - player.lastActivityTime;
    if (idle > IDLE_THRESHOLD_MS) {
      player.hp -= 5 * dt;
    }

    player.hp = Math.max(0, player.hp);

    if (Math.round(player.hp) !== Math.round(hpBefore)) {
      player.socket.emit('ascend:hp', { hp: Math.round(player.hp) });
    }

    if (player.hp <= 0) {
      eliminatePlayer(io, lobby, socketId, null);
      return;
    }

    const elapsed = now - player.startTime;
    if (elapsed > FLOOR_GRACE_PERIOD_MS) {
      const floorSpeed = Math.min(
        FLOOR_MAX_SPEED,
        FLOOR_BASE_SPEED + player.height * FLOOR_HEIGHT_FACTOR
      );
      player.floorHeight += floorSpeed * dt;

      if (player.floorHeight >= player.height) {
        eliminatePlayer(io, lobby, socketId, null);
        return;
      }
    }

    const gap = Math.round((player.height - player.floorHeight) * 10) / 10;
    player.socket.emit('ascend:floor', {
      floorHeight: Math.round(player.floorHeight * 10) / 10,
      height: Math.round(player.height * 10) / 10,
      gap
    });
  });

  if (aliveCount > 0 || lobby.players.size > 0) {
    broadcastScoreboard(io, lobby);
  }
}

function buildScoreboard(lobby) {
  const scoreboard = [];
  lobby.players.forEach(p => {
    if (!p.started && !p.eliminated) return;
    scoreboard.push({
      username: p.username,
      height: Math.round(p.height * 10) / 10,
      tier: p.tier,
      hp: Math.round(Math.max(0, p.hp)),
      momentum: p.momentum,
      eliminated: p.eliminated,
      wpm: p.lastTypingState?.wpm || 0,
      floorHeight: Math.round(p.floorHeight * 10) / 10
    });
  });
  scoreboard.sort((a, b) => b.height - a.height);
  return scoreboard;
}

function broadcastScoreboard(io, lobby) {
  const scoreboard = buildScoreboard(lobby);
  io.to(lobby.lobbyId).emit('ascend:update', { scoreboard });
}

function handleTypingUpdate(io, lobby, socketId, data) {
  const player = lobby.players.get(socketId);
  if (!player || player.eliminated || !player.started || !player.currentSentence) return;

  player.lastActivityTime = Date.now();

  player.lastTypingState = {
    position: data.position || 0,
    typed: data.typed || '',
    wpm: data.wpm || 0,
    errors: data.errors || 0,
    corrections: data.corrections || 0
  };

  const combo = player.comboState;
  const pos = data.position || 0;
  const errors = (data.errors || 0) + (data.corrections || 0);

  if (errors > combo.lastErrors) {
    combo.comboChars = 0;
    const newErrors = errors - combo.lastErrors;
    player.hp -= newErrors * 2;
    player.hp = Math.max(0, player.hp);
    player.socket.emit('ascend:hp', { hp: Math.round(player.hp) });
    if (player.hp <= 0) {
      eliminatePlayer(io, lobby, socketId, null);
      return;
    }
  } else if (pos > combo.lastPosition) {
    const charsTyped = pos - combo.lastPosition;
    combo.comboChars += charsTyped;

    player.momentumProgress += charsTyped;
    const threshold = MOMENTUM_THRESHOLDS[Math.min(player.momentum - 1, MOMENTUM_THRESHOLDS.length - 1)];
    if (player.momentumProgress >= threshold && player.momentum < 10) {
      player.momentum++;
      player.momentumProgress = 0;
      player.momentumDecayPause = 5000;
      player.socket.emit('ascend:momentum', { momentum: player.momentum });
    }
  }

  combo.lastPosition = pos;
  combo.lastErrors = errors;

  if (combo.comboChars >= COMBO_THRESHOLD) {
    combo.comboChars -= COMBO_THRESHOLD;
    combo.attackCount++;
    processAttack(io, lobby, socketId);
  }
}

function processAttack(io, lobby, attackerId) {
  const attacker = lobby.players.get(attackerId);
  if (!attacker) return;

  let target = null;
  let targetId = null;
  let closestDist = Infinity;

  lobby.players.forEach((p, sid) => {
    if (sid === attackerId || p.eliminated || !p.started) return;
    const dist = Math.abs(p.height - attacker.height);
    if (dist < closestDist) {
      closestDist = dist;
      target = p;
      targetId = sid;
    }
  });

  if (!target || !target.currentSentence) return;

  const attackType = pickAttackType(attacker.comboState.attackCount);

  let result = null;

  if (attackType === 'inject') {
    result = injectWord(target);
    target.socket.emit('ascend:attack:received', {
      type: 'inject',
      updatedSentence: result.updatedSentence,
      word: result.word,
      insertPos: result.insertIdx,
      injectedRanges: target.injectedRanges,
      hp: Math.round(target.hp)
    });
  } else if (attackType === 'scramble') {
    result = scrambleWord(target);
    if (!result) {
      result = injectWord(target);
    }
    target.socket.emit('ascend:attack:received', {
      type: result.range ? 'scramble' : 'inject',
      updatedSentence: result.updatedSentence,
      range: result.range,
      word: result.word,
      injectedRanges: target.injectedRanges,
      hp: Math.round(target.hp)
    });
  } else {
    result = caseChaos(target);
    if (!result) {
      result = injectWord(target);
    }
    target.socket.emit('ascend:attack:received', {
      type: result.range ? 'chaos' : 'inject',
      updatedSentence: result.updatedSentence,
      range: result.range,
      word: result.word,
      injectedRanges: target.injectedRanges,
      hp: Math.round(target.hp)
    });
  }

  attacker.socket.emit('ascend:attack:sent', { type: attackType, target: target.username });
}

function injectWord(player) {
  const sentence = player.currentSentence;
  const targetPos = player.comboState?.lastPosition || 0;

  let insertIdx = sentence.indexOf(' ', targetPos);
  if (insertIdx === -1) insertIdx = sentence.length;

  const word = pickGarbageWord();
  const injection = ' ' + word;
  const newSentence = sentence.slice(0, insertIdx) + injection + sentence.slice(insertIdx);

  const rangeStart = insertIdx;
  const rangeEnd = insertIdx + injection.length;

  player.currentSentence = newSentence;

  player.injectedRanges = player.injectedRanges.map(([s, e]) => {
    if (s >= insertIdx) return [s + injection.length, e + injection.length];
    if (e > insertIdx) return [s, e + injection.length];
    return [s, e];
  });
  player.injectedRanges.push([rangeStart, rangeEnd]);

  return { word, insertIdx, updatedSentence: newSentence };
}

function scrambleWord(player) {
  const sentence = player.currentSentence;
  const targetPos = player.comboState?.lastPosition || 0;

  let wordStart = sentence.indexOf(' ', targetPos);
  if (wordStart === -1) wordStart = targetPos;
  else wordStart++;

  let wordEnd = sentence.indexOf(' ', wordStart);
  if (wordEnd === -1) wordEnd = sentence.length;

  if (wordEnd - wordStart < 3) return null;

  const swapIdx = wordStart + Math.floor(Math.random() * (wordEnd - wordStart - 1));
  const chars = sentence.split('');
  [chars[swapIdx], chars[swapIdx + 1]] = [chars[swapIdx + 1], chars[swapIdx]];

  player.currentSentence = chars.join('');
  return { updatedSentence: player.currentSentence, range: [wordStart, wordEnd] };
}

function caseChaos(player) {
  const sentence = player.currentSentence;
  const targetPos = player.comboState?.lastPosition || 0;

  let start = sentence.indexOf(' ', targetPos);
  if (start === -1) start = targetPos;
  else start++;

  const end = Math.min(start + 10, sentence.length);
  if (start >= end) return null;

  const chars = sentence.split('');
  for (let i = start; i < end; i++) {
    if (chars[i] !== ' ') {
      chars[i] = Math.random() > 0.5 ? chars[i].toUpperCase() : chars[i].toLowerCase();
    }
  }

  player.currentSentence = chars.join('');
  return { updatedSentence: player.currentSentence, range: [start, end] };
}

function handleSentenceComplete(io, lobby, socketId, data) {
  const player = lobby.players.get(socketId);
  if (!player || player.eliminated || !player.started || !player.currentSentence) return;

  const wpm = data.wpm || 0;
  const bonusHeight = player.momentum * wpm / 10;
  player.height += bonusHeight;
  player.hp = Math.min(MAX_HP, player.hp + 20);
  player.lastActivityTime = Date.now();

  const newTier = getTier(player.height);
  if (newTier > player.tier) {
    player.tier = newTier;
    player.socket.emit('ascend:tier', { tier: newTier, height: Math.round(player.height * 10) / 10 });
  }

  assignSentence(io, lobby, socketId);
}

function eliminatePlayer(io, lobby, socketId, killerId) {
  const player = lobby.players.get(socketId);
  if (!player || player.eliminated) return;

  player.eliminated = true;
  player.hp = 0;
  player.finalHeight = player.height;
  player.finalTier = player.tier;

  if (killerId) {
    const killer = lobby.players.get(killerId);
    if (killer && !killer.eliminated) {
      killer.hp = Math.min(MAX_HP, killer.hp + 25);
      killer.height += 15;
      killer.knockouts++;
      killer.socket.emit('ascend:knockout', {
        victim: player.username,
        hp: Math.round(killer.hp),
        height: Math.round(killer.height * 10) / 10
      });
    }
  }

  io.to(lobby.lobbyId).emit('ascend:eliminated', {
    username: player.username,
    killedBy: killerId ? lobby.players.get(killerId)?.username : null,
    height: Math.round(player.finalHeight * 10) / 10,
    tier: player.finalTier
  });

  endRun(io, lobby, socketId);
}

async function endRun(io, lobby, socketId) {
  const player = lobby.players.get(socketId);
  if (!player) return;

  const totalTimeMs = Date.now() - (player.startTime || Date.now());
  const avgWpm = player.lastTypingState?.wpm || 0;

  let xpGain = null;
  if (player.userId) {
    xpGain = await updateXpOnly(player.userId, false, avgWpm, 'ascend', totalTimeMs);
    await saveAscendRun(
      player.userId,
      player.username,
      Math.round(player.height * 10) / 10,
      player.tier,
      totalTimeMs
    );
  }

  player.socket.emit('ascend:run:end', {
    height: Math.round((player.finalHeight || player.height) * 10) / 10,
    tier: player.finalTier || player.tier,
    duration: totalTimeMs,
    knockouts: player.knockouts,
    xpGain
  });

  player.socket.leave(lobby.lobbyId);
  lobby.players.delete(socketId);

  scheduleCleanup(lobby);
}

function leaveLobby(io, socketId) {
  const lobby = getLobbyBySocketId(socketId);
  if (!lobby) return;

  const player = lobby.players.get(socketId);
  if (!player) return;

  if (!player.eliminated && player.started) {
    player.eliminated = true;
    player.finalHeight = player.height;
    player.finalTier = player.tier;

    io.to(lobby.lobbyId).emit('ascend:eliminated', {
      username: player.username,
      killedBy: null,
      height: Math.round(player.finalHeight * 10) / 10,
      tier: player.finalTier
    });

    endRun(io, lobby, socketId);
  } else {
    player.socket.leave(lobby.lobbyId);
    lobby.players.delete(socketId);
    scheduleCleanup(lobby);
  }
}

function scheduleCleanup(lobby) {
  if (lobby.players.size > 0) return;

  if (activeLobby === lobby) {
    activeLobby = null;
  }

  lobby.emptyTimer = setTimeout(() => {
    if (lobby.players.size === 0) {
      cleanupLobby(lobby);
    }
  }, LOBBY_EMPTY_TIMEOUT_MS);
}

function cleanupLobby(lobby) {
  if (lobby.gameLoop) {
    clearInterval(lobby.gameLoop);
    lobby.gameLoop = null;
  }
  if (lobby.emptyTimer) {
    clearTimeout(lobby.emptyTimer);
    lobby.emptyTimer = null;
  }
  if (activeLobby === lobby) {
    activeLobby = null;
  }
  lobbies.delete(lobby.lobbyId);
}

function handleDisconnect(io, socketId) {
  for (const [, lobby] of lobbies) {
    const player = lobby.players.get(socketId);
    if (!player) continue;

    if (!player.eliminated && player.started) {
      player.eliminated = true;
      player.finalHeight = player.height;
      player.finalTier = player.tier;

      io.to(lobby.lobbyId).emit('ascend:eliminated', {
        username: player.username,
        killedBy: null,
        height: Math.round(player.finalHeight * 10) / 10,
        tier: player.finalTier,
        disconnected: true
      });
    }

    player.socket.leave(lobby.lobbyId);
    lobby.players.delete(socketId);

    scheduleCleanup(lobby);
    return;
  }
}

function getLobbyBySocketId(socketId) {
  for (const [, lobby] of lobbies) {
    if (lobby.players.has(socketId)) return lobby;
  }
  return null;
}

module.exports = {
  joinLobby, leaveLobby,
  handleTypingUpdate, handleSentenceComplete,
  handleDisconnect, getLobbyBySocketId
};
