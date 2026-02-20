const quotesData = require('./data/english.json');

const quotes = quotesData.quotes;

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

module.exports = { quotes, pickSentences };
