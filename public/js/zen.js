const ZenMode = (() => {
  let sentence = '';
  let typed = '';
  let startTime = null;
  let corrections = 0;
  let totalErrors = 0;
  let active = false;
  let statsInterval = null;
  let sentenceQueue = [];
  let currentSentenceIndex = 0;
  let totalCharsTyped = 0;

  const els = {};

  function init() {
    els.sentenceDisplay = document.getElementById('zen-sentence-display');
    els.typingInput = document.getElementById('zen-typing-input');
    els.wpm = document.getElementById('zen-wpm');
    els.accuracy = document.getElementById('zen-accuracy');
    els.chars = document.getElementById('zen-chars');
    els.timer = document.getElementById('zen-timer');
    els.quoteSource = document.getElementById('zen-quote-source');

    if (!els.typingInput) return;

    els.typingInput.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && (e.ctrlKey || e.metaKey || e.altKey)) {
        e.preventDefault();
        const pos = els.typingInput.selectionStart;
        const text = els.typingInput.value;
        if (pos === 0) return;
        let i = pos - 1;
        while (i > 0 && text[i - 1] === ' ') i--;
        while (i > 0 && text[i - 1] !== ' ') i--;
        els.typingInput.value = text.slice(0, i) + text.slice(pos);
        els.typingInput.selectionStart = els.typingInput.selectionEnd = i;
        els.typingInput.dispatchEvent(new Event('input'));
      }
    });

    els.typingInput.addEventListener('input', handleInput);
  }

  async function startGame() {
    cleanup();
    try {
      const res = await fetch('/api/time-trial/sentences?duration=120');
      const data = await res.json();
      sentence = data.text;
      if (els.quoteSource) {
        els.quoteSource.textContent = data.source ? `— ${data.source}` : '';
      }
    } catch (err) {
      sentence = 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.';
    }

    typed = '';
    corrections = 0;
    totalErrors = 0;
    totalCharsTyped = 0;
    active = true;
    startTime = Date.now();

    els.typingInput.value = '';
    els.typingInput.disabled = false;
    els.typingInput.focus();

    renderSentence();
    updateStatsDisplay();

    statsInterval = setInterval(() => {
      if (active) {
        updateStatsDisplay();
        updateTimer();
      }
    }, 400);
  }

  function handleInput() {
    if (!active) return;

    const inputValue = els.typingInput.value;
    const prevLen = typed.length;
    const newLen = inputValue.length;

    if (newLen < prevLen) {
      corrections += prevLen - newLen;
    }

    if (newLen > prevLen) {
      for (let i = prevLen; i < newLen && i < sentence.length; i++) {
        if (inputValue[i] !== sentence[i]) totalErrors++;
      }
    }

    typed = inputValue;
    renderSentence();

    if (typed.length >= sentence.length) {
      totalCharsTyped += typed.length;
      loadNextSentence();
    }
  }

  async function loadNextSentence() {
    typed = '';
    els.typingInput.value = '';
    corrections = 0;
    totalErrors = 0;

    try {
      const res = await fetch('/api/time-trial/sentences?duration=120');
      const data = await res.json();
      sentence = data.text;
      if (els.quoteSource) {
        els.quoteSource.textContent = data.source ? `— ${data.source}` : '';
      }
    } catch (_) {
      sentence = 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.';
    }

    renderSentence();
  }

  function getStats() {
    const elapsed = startTime ? Date.now() - startTime : 0;
    const elapsedMin = elapsed / 60000;

    let correct = 0;
    let uncorrected = 0;
    for (let i = 0; i < typed.length && i < sentence.length; i++) {
      if (typed[i] === sentence[i]) correct++;
      else uncorrected++;
    }

    const allCorrect = totalCharsTyped + correct;
    const wpm = elapsedMin > 0 ? Math.round((allCorrect / 5) / elapsedMin) : 0;
    const totalTyped = totalCharsTyped + typed.length;
    const accuracy = totalTyped > 0 ? Math.round(((totalTyped - totalErrors) / totalTyped) * 100) : 100;

    return { wpm, accuracy: Math.max(0, accuracy), correct, uncorrected, totalTyped, elapsed };
  }

  function updateStatsDisplay() {
    const stats = getStats();
    if (els.wpm) els.wpm.textContent = stats.wpm;
    if (els.accuracy) els.accuracy.textContent = stats.accuracy + '%';
    if (els.chars) els.chars.textContent = stats.totalTyped;
  }

  function updateTimer() {
    if (!startTime || !els.timer) return;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    els.timer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

  function renderSentence() {
    if (!els.sentenceDisplay) return;
    let html = '';
    for (let i = 0; i < sentence.length; i++) {
      let cls;
      if (i < typed.length) {
        cls = typed[i] === sentence[i] ? 'correct' : 'error';
      } else if (i === typed.length) {
        cls = 'current';
      } else {
        cls = 'pending';
      }
      const isSpace = sentence[i] === ' ';
      const isErrorOnSpace = isSpace && cls === 'error' && typed[i] && typed[i] !== ' ';
      const ch = isErrorOnSpace ? UI.escapeHtml(typed[i]) : (isSpace ? ' ' : UI.escapeHtml(sentence[i]));
      html += `<span class="char ${cls}${isSpace && !isErrorOnSpace ? ' space' : ''}">${ch}</span>`;
    }
    els.sentenceDisplay.innerHTML = html;

    const currentEl = els.sentenceDisplay.querySelector('.char.current');
    if (currentEl) currentEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function cleanup() {
    active = false;
    if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
    typed = '';
    sentence = '';
    startTime = null;
    totalCharsTyped = 0;
  }

  function exitGame() {
    if (!active) return null;
    const finalChars = totalCharsTyped + typed.length;
    const stats = getStats();
    stats.totalCharsTyped = finalChars;
    active = false;
    if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
    typed = '';
    sentence = '';
    startTime = null;
    totalCharsTyped = 0;
    return stats;
  }

  function isActive() { return active; }
  function getInput() { return els.typingInput; }

  return { init, startGame, exitGame, cleanup, isActive, getInput };
})();
