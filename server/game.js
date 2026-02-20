const { pickSentences } = require('./sentences');
const { updateStats, updateXpOnly } = require('./db');

const ROUNDS_TO_WIN = 2;
const TOTAL_ROUNDS = 3;
const COUNTDOWN_SECONDS = 3;
const ROUND_TIMEOUT_MS = 60000;
const FINISH_GRACE_MS = 10000;
const COMBO_THRESHOLD = 20;
const TARGET_PROMPT_LENGTH = 200;

const GARBAGE_WORDS = [
  'the', 'and', 'but', 'from', 'with', 'over', 'just',
  'also', 'very', 'each', 'more', 'some', 'only', 'into'
];

const games = new Map();

function computeScore(wpm, uncorrectedErrors, correctedErrors) {
  const base = wpm * 10;
  const penalty = (uncorrectedErrors * 50) + (correctedErrors * 15);
  return Math.max(0, Math.round(base - penalty));
}

function buildRoundPrompts(totalRounds) {
  const pool = pickSentences(totalRounds * 5);
  const remaining = pool.picked.slice();
  const allIndices = pool.indices.slice();
  const prompts = [];
  const usedIndices = [];

  for (let r = 0; r < totalRounds; r++) {
    const group = [];
    let len = 0;
    while (remaining.length > 0 && (group.length === 0 || len < TARGET_PROMPT_LENGTH)) {
      const s = remaining.shift();
      group.push(s);
      usedIndices.push(allIndices.shift());
      len += s.text.length;
    }
    prompts.push({
      text: group.map(s => s.text).join(' '),
      source: group.map(s => s.source).join(' / ')
    });
  }

  return { prompts, usedIndices };
}

function createGame(roomId, player1, player2, mode) {
  const { prompts, usedIndices } = buildRoundPrompts(TOTAL_ROUNDS);

  const game = {
    roomId,
    mode,
    players: {
      [player1.socket.id]: {
        socket: player1.socket,
        username: player1.username,
        userId: player1.userId,
        rating: player1.rating,
        roundsWon: 0
      },
      [player2.socket.id]: {
        socket: player2.socket,
        username: player2.username,
        userId: player2.userId,
        rating: player2.rating,
        roundsWon: 0
      }
    },
    sentences: prompts,
    usedIndices,
    currentRound: 0,
    roundState: 'waiting',
    roundResults: [],
    roundCompletions: {},
    roundTimeout: null,
    graceTimeout: null,
    matchStartTime: Date.now(),
    playerSentences: {},
    comboState: {},
    injectedRanges: {},
    lastTypingState: {}
  };

  games.set(roomId, game);
  return game;
}

function getGame(roomId) {
  return games.get(roomId);
}

function getGameBySocketId(socketId) {
  for (const [roomId, game] of games) {
    if (game.players[socketId]) return game;
  }
  return null;
}

function startCountdown(io, game) {
  const round = game.currentRound;
  const sentenceObj = game.sentences[round];
  const sentence = sentenceObj.text;
  game.roundState = 'countdown';
  game.roundCompletions = {};
  game.lastTypingState = {};

  const playerIds = Object.keys(game.players);
  playerIds.forEach(id => {
    game.playerSentences[id] = sentence;
    game.comboState[id] = { lastPosition: 0, lastErrors: 0, comboChars: 0, attackCount: 0 };
    game.injectedRanges[id] = [];
  });
  const matchScore = {};
  playerIds.forEach(id => {
    matchScore[game.players[id].username] = game.players[id].roundsWon;
  });

  io.to(game.roomId).emit('round:countdown', {
    round: round + 1,
    totalRounds: TOTAL_ROUNDS,
    sentence,
    source: sentenceObj.source,
    seconds: COUNTDOWN_SECONDS,
    matchScore
  });

  let count = COUNTDOWN_SECONDS;
  const interval = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(interval);
      startRound(io, game);
    }
  }, 1000);
}

function startRound(io, game) {
  game.roundState = 'playing';
  const startTime = Date.now();
  io.to(game.roomId).emit('round:start', { startTime });

  game.roundTimeout = setTimeout(() => {
    endRound(io, game);
  }, ROUND_TIMEOUT_MS);
}

function pickGarbageWord() {
  return GARBAGE_WORDS[Math.floor(Math.random() * GARBAGE_WORDS.length)];
}

function injectWord(game, targetId) {
  const sentence = game.playerSentences[targetId];
  const combo = game.comboState[targetId];
  const targetPos = combo ? combo.lastPosition : 0;

  let insertIdx = sentence.indexOf(' ', targetPos);
  if (insertIdx === -1) insertIdx = sentence.length;

  const word = pickGarbageWord();
  const injection = ' ' + word;
  const newSentence = sentence.slice(0, insertIdx) + injection + sentence.slice(insertIdx);

  const rangeStart = insertIdx;
  const rangeEnd = insertIdx + injection.length;

  game.playerSentences[targetId] = newSentence;

  game.injectedRanges[targetId] = game.injectedRanges[targetId].map(([s, e]) => {
    if (s >= insertIdx) return [s + injection.length, e + injection.length];
    if (e > insertIdx) return [s, e + injection.length];
    return [s, e];
  });
  game.injectedRanges[targetId].push([rangeStart, rangeEnd]);

  return { word, insertIdx, updatedSentence: newSentence, injectedRanges: game.injectedRanges[targetId] };
}

function scrambleWord(game, targetId) {
  const sentence = game.playerSentences[targetId];
  const targetPos = game.comboState[targetId]?.lastPosition || 0;

  let wordStart = sentence.indexOf(' ', targetPos);
  if (wordStart === -1) wordStart = targetPos;
  else wordStart++;

  let wordEnd = sentence.indexOf(' ', wordStart);
  if (wordEnd === -1) wordEnd = sentence.length;

  if (wordEnd - wordStart < 3) return null;

  const swapIdx = wordStart + Math.floor(Math.random() * (wordEnd - wordStart - 1));
  const chars = sentence.split('');
  [chars[swapIdx], chars[swapIdx + 1]] = [chars[swapIdx + 1], chars[swapIdx]];

  game.playerSentences[targetId] = chars.join('');
  return { updatedSentence: game.playerSentences[targetId], range: [wordStart, wordEnd] };
}

function caseChaos(game, targetId) {
  const sentence = game.playerSentences[targetId];
  const targetPos = game.comboState[targetId]?.lastPosition || 0;

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

  game.playerSentences[targetId] = chars.join('');
  return { updatedSentence: game.playerSentences[targetId], range: [start, end] };
}

function pickAttackType(attackCount) {
  if (attackCount % 2 === 1) return 'inject';
  return Math.random() < 0.5 ? 'scramble' : 'chaos';
}

function handleTypingUpdate(io, game, socketId, data) {
  if (game.roundState !== 'playing') return;
  const opponent = Object.keys(game.players).find(id => id !== socketId);
  if (!opponent) return;

  game.lastTypingState[socketId] = {
    position: data.position || 0,
    typed: data.typed || '',
    wpm: data.wpm || 0,
    errors: data.errors || 0,
    corrections: data.corrections || 0
  };

  const playerSentence = game.playerSentences[socketId];
  const progress = Math.min(1, (data.position || 0) / playerSentence.length);

  game.players[opponent].socket.emit('opponent:update', {
    progress,
    position: data.position || 0,
    typed: data.typed || '',
    wpm: data.wpm || 0,
    username: game.players[socketId].username
  });

  const combo = game.comboState[socketId];
  if (!combo) return;

  const pos = data.position || 0;
  const errors = (data.errors || 0) + (data.corrections || 0);

  if (errors > combo.lastErrors) {
    combo.comboChars = 0;
  } else if (pos > combo.lastPosition) {
    combo.comboChars += (pos - combo.lastPosition);
  }

  combo.lastPosition = pos;
  combo.lastErrors = errors;

  if (combo.comboChars >= COMBO_THRESHOLD) {
    combo.comboChars -= COMBO_THRESHOLD;
    if (game.roundCompletions[opponent]) return;

    combo.attackCount++;
    const attackType = pickAttackType(combo.attackCount);
    let result = null;

    if (attackType === 'inject') {
      result = injectWord(game, opponent);
      game.players[opponent].socket.emit('attack:inject', {
        updatedSentence: result.updatedSentence,
        word: result.word,
        insertPos: result.insertIdx,
        injectedRanges: result.injectedRanges
      });
    } else if (attackType === 'scramble') {
      result = scrambleWord(game, opponent);
      if (!result) { result = injectWord(game, opponent); }
      game.players[opponent].socket.emit('attack:scramble', {
        updatedSentence: result.updatedSentence,
        range: result.range
      });
    } else {
      result = caseChaos(game, opponent);
      if (!result) { result = injectWord(game, opponent); }
      game.players[opponent].socket.emit('attack:chaos', {
        updatedSentence: result.updatedSentence,
        range: result.range
      });
    }

    game.players[socketId].socket.emit('attack:sent', {
      type: attackType,
      word: result.word || null,
      opponentSentence: game.playerSentences[opponent],
      opponentInjectedRanges: game.injectedRanges[opponent],
      affectedRange: result.range || null
    });
  }
}

function handleRoundComplete(io, game, socketId, data) {
  if (game.roundState !== 'playing') return;
  if (game.roundCompletions[socketId]) return;

  const sentence = game.playerSentences[socketId] || game.sentences[game.currentRound].text;
  const typed = data.typed || '';
  let uncorrectedErrors = 0;
  for (let i = 0; i < sentence.length; i++) {
    if (i < typed.length && typed[i] !== sentence[i]) uncorrectedErrors++;
    if (i >= typed.length) uncorrectedErrors++;
  }

  const elapsedMs = data.time || 1;
  const elapsedMin = elapsedMs / 60000;
  const charsTyped = typed.length;
  const wpm = elapsedMin > 0 ? Math.round((charsTyped / 5) / elapsedMin) : 0;
  const correctedErrors = Math.max(0, data.corrections || 0);
  const score = computeScore(wpm, uncorrectedErrors, correctedErrors);

  game.roundCompletions[socketId] = {
    wpm,
    uncorrectedErrors,
    correctedErrors,
    score,
    time: elapsedMs,
    username: game.players[socketId].username
  };

  const opponent = Object.keys(game.players).find(id => id !== socketId);
  if (opponent) {
    game.players[opponent].socket.emit('opponent:update', {
      progress: 1,
      wpm,
      username: game.players[socketId].username,
      finished: true
    });
  }

  const allDone = Object.keys(game.players).every(id => game.roundCompletions[id]);
  if (allDone) {
    if (game.graceTimeout) {
      clearTimeout(game.graceTimeout);
      game.graceTimeout = null;
    }
    endRound(io, game);
  } else if (!game.graceTimeout) {
    if (game.roundTimeout) {
      clearTimeout(game.roundTimeout);
      game.roundTimeout = null;
    }

    io.to(game.roomId).emit('round:timer', {
      seconds: FINISH_GRACE_MS / 1000,
      finisher: game.players[socketId].username
    });

    game.graceTimeout = setTimeout(() => {
      game.graceTimeout = null;
      endRound(io, game);
    }, FINISH_GRACE_MS);
  }
}

function endRound(io, game) {
  if (game.roundState === 'ended') return;
  game.roundState = 'ended';

  if (game.roundTimeout) {
    clearTimeout(game.roundTimeout);
    game.roundTimeout = null;
  }
  if (game.graceTimeout) {
    clearTimeout(game.graceTimeout);
    game.graceTimeout = null;
  }

  const playerIds = Object.keys(game.players);
  playerIds.forEach(id => {
    if (!game.roundCompletions[id]) {
      const last = game.lastTypingState?.[id];
      if (last && last.typed) {
        const sentence = game.playerSentences[id];
        let uncorrectedErrors = 0;
        for (let i = 0; i < last.typed.length && i < sentence.length; i++) {
          if (last.typed[i] !== sentence[i]) uncorrectedErrors++;
        }
        const elapsedMs = ROUND_TIMEOUT_MS;
        const elapsedMin = elapsedMs / 60000;
        const wpm = elapsedMin > 0 ? Math.round((last.typed.length / 5) / elapsedMin) : 0;
        const correctedErrors = Math.max(0, last.corrections || 0);
        const score = computeScore(wpm, uncorrectedErrors, correctedErrors);

        game.roundCompletions[id] = {
          wpm, uncorrectedErrors, correctedErrors, score,
          time: elapsedMs,
          username: game.players[id].username,
          timedOut: true
        };
      } else {
        game.roundCompletions[id] = {
          wpm: 0, uncorrectedErrors: 0, correctedErrors: 0,
          score: 0, time: ROUND_TIMEOUT_MS,
          username: game.players[id].username,
          timedOut: true
        };
      }
    }
  });

  const scores = playerIds.map(id => game.roundCompletions[id]);
  let roundWinner = null;
  if (scores.length === 2) {
    if (scores[0].score > scores[1].score) roundWinner = scores[0].username;
    else if (scores[1].score > scores[0].score) roundWinner = scores[1].username;
  }

  if (roundWinner) {
    const winnerId = playerIds.find(id => game.players[id].username === roundWinner);
    if (winnerId) game.players[winnerId].roundsWon++;
  }

  const matchScore = {};
  playerIds.forEach(id => {
    matchScore[game.players[id].username] = game.players[id].roundsWon;
  });

  game.roundResults.push({ scores, roundWinner });
  game.currentRound++;

  const someoneWon = playerIds.some(id => game.players[id].roundsWon >= ROUNDS_TO_WIN);
  const allRoundsPlayed = game.currentRound >= TOTAL_ROUNDS;
  const matchOver = someoneWon || allRoundsPlayed;

  playerIds.forEach(id => {
    const myResult = game.roundCompletions[id];
    const oppId = playerIds.find(x => x !== id);
    const oppResult = game.roundCompletions[oppId];

    game.players[id].socket.emit('round:result', {
      round: game.currentRound,
      you: myResult,
      opponent: oppResult,
      roundWinner,
      matchScore,
      matchOver
    });
  });

  if (matchOver) {
    setTimeout(() => endMatch(io, game), 100);
  } else {
    setTimeout(() => startCountdown(io, game), 4000);
  }
}

async function endMatch(io, game) {
  const playerIds = Object.keys(game.players);
  let matchWinner = null;
  let maxWins = 0;
  playerIds.forEach(id => {
    if (game.players[id].roundsWon > maxWins) {
      maxWins = game.players[id].roundsWon;
      matchWinner = game.players[id].username;
    }
  });

  if (playerIds.length === 2 && game.players[playerIds[0]].roundsWon === game.players[playerIds[1]].roundsWon) {
    matchWinner = null;
  }

  const matchScore = {};
  const ratingChanges = {};
  const xpChanges = {};
  const totalTimeMs = Date.now() - (game.matchStartTime || Date.now());

  playerIds.forEach(id => {
    matchScore[game.players[id].username] = game.players[id].roundsWon;
  });

  for (const id of playerIds) {
    const player = game.players[id];
    if (!player.userId) continue;

    const won = player.username === matchWinner;
    const opId = playerIds.find(x => x !== id);
    const opponentRating = game.players[opId].rating;
    const avgWpm = game.roundResults.reduce((sum, r) => {
      const myScore = r.scores.find(s => s.username === player.username);
      return sum + (myScore ? myScore.wpm : 0);
    }, 0) / game.roundResults.length;

    if (game.mode === 'ranked') {
      const result = await updateStats(player.userId, won, avgWpm, opponentRating, game.mode, totalTimeMs);
      if (result) {
        ratingChanges[player.username] = result;
        xpChanges[player.username] = {
          xpGained: result.xpGained,
          newXp: result.newXp,
          oldLevel: result.oldLevel,
          newLevel: result.newLevel,
          isPb: result.isPb
        };
      }
    } else {
      const result = await updateXpOnly(player.userId, won, avgWpm, game.mode, totalTimeMs);
      if (result) {
        xpChanges[player.username] = result;
      }
    }
  }

  playerIds.forEach(id => {
    game.players[id].socket.emit('match:result', {
      winner: matchWinner,
      matchScore,
      ratingChange: ratingChanges[game.players[id].username] || null,
      xpGain: xpChanges[game.players[id].username] || null,
      rounds: game.roundResults
    });
  });

  setTimeout(() => {
    playerIds.forEach(id => {
      game.players[id].socket.leave(game.roomId);
    });
    games.delete(game.roomId);
  }, 1000);
}

async function handleDisconnect(io, socketId) {
  const game = getGameBySocketId(socketId);
  if (!game) return;

  const opponent = Object.keys(game.players).find(id => id !== socketId);
  if (!opponent) { games.delete(game.roomId); return; }

  if (game.roundTimeout) clearTimeout(game.roundTimeout);
  if (game.graceTimeout) clearTimeout(game.graceTimeout);

  game.players[opponent].socket.emit('opponent:disconnected', {
    username: game.players[socketId].username
  });

  const opPlayer = game.players[opponent];
  opPlayer.roundsWon = ROUNDS_TO_WIN;

  const matchScore = {};
  matchScore[opPlayer.username] = opPlayer.roundsWon;
  matchScore[game.players[socketId].username] = game.players[socketId].roundsWon;

  const totalTimeMs = Date.now() - (game.matchStartTime || Date.now());

  if (opPlayer.userId) {
    const dcPlayerRating = game.players[socketId].rating;
    const avgWpm = game.roundResults.length > 0
      ? game.roundResults.reduce((sum, r) => {
          const myScore = r.scores.find(s => s.username === opPlayer.username);
          return sum + (myScore ? myScore.wpm : 0);
        }, 0) / game.roundResults.length
      : 0;

    let ratingChange = null;
    let xpGain = null;

    if (game.mode === 'ranked') {
      const result = await updateStats(opPlayer.userId, true, avgWpm, dcPlayerRating, game.mode, totalTimeMs);
      if (result) {
        ratingChange = result;
        xpGain = { xpGained: result.xpGained, newXp: result.newXp, oldLevel: result.oldLevel, newLevel: result.newLevel, isPb: result.isPb };
      }
    } else {
      const result = await updateXpOnly(opPlayer.userId, true, avgWpm, game.mode, totalTimeMs);
      if (result) xpGain = result;
    }

    opPlayer.socket.emit('match:result', {
      winner: opPlayer.username,
      matchScore,
      ratingChange,
      xpGain,
      rounds: game.roundResults,
      forfeit: true
    });
  } else {
    opPlayer.socket.emit('match:result', {
      winner: opPlayer.username,
      matchScore,
      rounds: game.roundResults,
      forfeit: true
    });
  }

  if (game.players[socketId].userId) {
    const avgWpm = game.roundResults.length > 0
      ? game.roundResults.reduce((sum, r) => {
          const myScore = r.scores.find(s => s.username === game.players[socketId].username);
          return sum + (myScore ? myScore.wpm : 0);
        }, 0) / game.roundResults.length
      : 0;

    if (game.mode === 'ranked') {
      await updateStats(game.players[socketId].userId, false, avgWpm, opPlayer.rating, game.mode, totalTimeMs);
    } else {
      await updateXpOnly(game.players[socketId].userId, false, avgWpm, game.mode, totalTimeMs);
    }
  }

  opPlayer.socket.leave(game.roomId);
  games.delete(game.roomId);
}

module.exports = {
  createGame, getGame, getGameBySocketId,
  startCountdown, handleTypingUpdate, handleRoundComplete,
  handleDisconnect, computeScore
};
