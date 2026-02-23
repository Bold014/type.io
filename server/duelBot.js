const BOT_NAMES = require('./botNames');

const BOT_WPM_MIN = 40;
const BOT_WPM_MAX = 90;
const BOT_ERROR_CHANCE = 0.03;
const BOT_TICK_MS = 100;

let botIdCounter = 0;

function createBotSocket(botId, username) {
  return {
    id: botId,
    data: { username, userId: null, rating: 1000 },
    emit() {},
    join() {},
    leave() {}
  };
}

function createBotPlayer() {
  botIdCounter++;
  const botId = `bot_duel_${botIdCounter}_${Date.now()}`;
  const username = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  const rating = 800 + Math.floor(Math.random() * 401);
  const wpm = BOT_WPM_MIN + Math.floor(Math.random() * (BOT_WPM_MAX - BOT_WPM_MIN + 1));

  const socket = createBotSocket(botId, username);

  return {
    socket,
    username,
    userId: null,
    rating,
    _botWpm: wpm
  };
}

function startBotRound(io, game, botSocketId) {
  const { handleTypingUpdate, handleRoundComplete } = require('./game');

  const player = game.players[botSocketId];
  if (!player) return;

  const wpm = game.botState.wpm;
  let typedPosition = 0;
  let errors = 0;
  const roundStartTime = Date.now();

  game.botState.typedPosition = 0;

  const interval = setInterval(() => {
    if (game.roundState !== 'playing') {
      clearInterval(interval);
      game.botState.interval = null;
      return;
    }

    const sentence = game.playerSentences[botSocketId];
    if (!sentence) return;

    const charsPerSecond = (wpm * 5) / 60;
    const jitter = 1 + (Math.random() * 0.3 - 0.15);
    typedPosition += charsPerSecond * (BOT_TICK_MS / 1000) * jitter;

    if (Math.random() < BOT_ERROR_CHANCE) {
      errors++;
    }

    const pos = Math.min(Math.floor(typedPosition), sentence.length);
    game.botState.typedPosition = pos;

    const elapsedMs = Date.now() - roundStartTime;
    const elapsedMin = elapsedMs / 60000;
    const displayWpm = elapsedMin > 0 ? Math.round((pos / 5) / elapsedMin) : 0;

    handleTypingUpdate(io, game, botSocketId, {
      position: pos,
      typed: sentence.substring(0, pos),
      wpm: displayWpm,
      errors: errors,
      corrections: 0
    });

    if (pos >= sentence.length) {
      clearInterval(interval);
      game.botState.interval = null;

      handleRoundComplete(io, game, botSocketId, {
        typed: sentence,
        wpm: displayWpm,
        corrections: 0,
        time: Date.now() - roundStartTime
      });
    }
  }, BOT_TICK_MS);

  game.botState.interval = interval;
}

function stopBotRound(game) {
  if (game.botState && game.botState.interval) {
    clearInterval(game.botState.interval);
    game.botState.interval = null;
  }
}

module.exports = { createBotPlayer, startBotRound, stopBotRound };
