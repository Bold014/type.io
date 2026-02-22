const quotesData = require('./data/english.json');

const quotes = quotesData.quotes;

const TIER_TARGET_LENGTH = [100, 130, 160, 190, 220, 250, 280, 310, 340, 370];

function pickSentences(count, exclude = []) {
  const available = quotes.filter((_, i) => !exclude.includes(i));
  const picked = [];
  const indices = [];
  const pool = available.map((q) => {
    const origIndex = quotes.indexOf(q);
    return { quote: q, index: origIndex };
  });

  for (let i = 0; i < count && pool.length > 0; i++) {
    const rand = Math.floor(Math.random() * pool.length);
    const item = pool.splice(rand, 1)[0];
    picked.push({ text: item.quote.text, source: item.quote.source });
    indices.push(item.index);
  }

  return { picked, indices };
}

function pickSentencesForTier(tier) {
  const idx = Math.max(0, Math.min(tier - 1, TIER_TARGET_LENGTH.length - 1));
  const targetLen = TIER_TARGET_LENGTH[idx];

  const pool = quotes.slice();
  const group = [];
  let len = 0;

  while (pool.length > 0 && (group.length === 0 || len < targetLen)) {
    const rand = Math.floor(Math.random() * pool.length);
    const q = pool.splice(rand, 1)[0];
    group.push(q);
    len += q.text.length;
  }

  return {
    text: group.map(q => q.text).join(' '),
    source: group.map(q => q.source).join(' / ')
  };
}

function pickSentencesForDuration(durationSec) {
  const charsPerMin = 400;
  const targetLen = Math.ceil((charsPerMin * durationSec) / 60) + 200;

  const pool = quotes.slice();
  const group = [];
  let len = 0;

  while (pool.length > 0 && len < targetLen) {
    const rand = Math.floor(Math.random() * pool.length);
    const q = pool.splice(rand, 1)[0];
    group.push(q);
    len += q.text.length;
  }

  return {
    text: group.map(q => q.text).join(' '),
    source: group.map(q => q.source).join(' / ')
  };
}

let _wordCache = null;

function buildWordBank() {
  if (_wordCache) return _wordCache;
  const wordSet = new Set();
  for (const q of quotes) {
    const words = q.text.replace(/[^a-zA-Z\s'-]/g, '').split(/\s+/);
    for (const w of words) {
      if (w.length >= 3) wordSet.add(w.toLowerCase());
    }
  }
  const all = Array.from(wordSet);
  _wordCache = {
    easy: all.filter(w => w.length >= 3 && w.length <= 5),
    medium: all.filter(w => w.length >= 4 && w.length <= 7),
    hard: all.filter(w => w.length >= 5 && w.length <= 10),
    all
  };
  return _wordCache;
}

function getWordBank() {
  return buildWordBank();
}

module.exports = { quotes, pickSentences, pickSentencesForTier, pickSentencesForDuration, getWordBank };
