const RaceClient = (() => {
  let active = false;
  let sentence = '';
  let typed = '';
  let startTime = null;
  let corrections = 0;
  let totalErrors = 0;
  let players = [];
  let myUsername = '';
  let statsInterval = null;
  let inLobby = false;

  const els = {};

  function init() {
    els.sentenceDisplay = document.getElementById('race-sentence-display');
    els.typingInput = document.getElementById('race-typing-input');
    els.wpm = document.getElementById('race-wpm');
    els.accuracy = document.getElementById('race-accuracy');
    els.trackArea = document.getElementById('race-track-area');
    els.timer = document.getElementById('race-timer');
    els.countdownOverlay = document.getElementById('race-countdown-overlay');
    els.countdownNumber = document.getElementById('race-countdown-number');
    els.quoteSource = document.getElementById('race-quote-source');
    els.playerCount = document.getElementById('race-player-count');

    if (els.sentenceDisplay) {
      sentence = 'This is placeholder race text to reserve space before the race starts.';
      typed = '';
      renderSentence();
      els.sentenceDisplay.style.visibility = 'hidden';
    }

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

  function setMyUsername(name) { myUsername = name; }

  function handleLobbyUpdate(data) {
    inLobby = true;
    players = data.players || [];
    if (els.trackArea) els.trackArea.style.display = '';
    renderTrack();
    if (els.playerCount) els.playerCount.textContent = players.length + ' / 8';
    if (els.timer) els.timer.textContent = 'Waiting for players...';
  }

  function handleJoined(data) {
    inLobby = false;
    players = data.players || [];
    if (els.trackArea) els.trackArea.style.display = '';
    renderTrack();
    if (els.playerCount) els.playerCount.textContent = players.length + ' / 8';
    if (els.timer) els.timer.textContent = '';
  }

  function handleCountdown(data) {
    inLobby = false;
    if (els.trackArea) els.trackArea.style.display = '';
    sentence = data.sentence || '';
    typed = '';
    corrections = 0;
    totalErrors = 0;
    startTime = null;
    active = false;

    renderSentence();
    if (els.sentenceDisplay) {
      els.sentenceDisplay.style.visibility = 'visible';
    }
    if (els.quoteSource) els.quoteSource.textContent = data.source ? `— ${data.source}` : '';

    if (els.countdownOverlay) {
      els.countdownOverlay.style.display = 'flex';
      let count = data.seconds || 3;
      els.countdownNumber.textContent = count;
      const interval = setInterval(() => {
        count--;
        if (count > 0) {
          els.countdownNumber.textContent = count;
        } else {
          clearInterval(interval);
          els.countdownOverlay.style.display = 'none';
        }
      }, 1000);
    }
  }

  function handleStart() {
    active = true;
    startTime = Date.now();
    if (els.typingInput) {
      els.typingInput.value = '';
      els.typingInput.disabled = false;
      els.typingInput.focus();
    }
    statsInterval = setInterval(() => {
      if (active) updateStats();
    }, 400);
  }

  function handleInput() {
    if (!active) return;
    const inputValue = els.typingInput.value;
    const prevLen = typed.length;
    const newLen = inputValue.length;

    if (newLen < prevLen) corrections += prevLen - newLen;
    if (newLen > prevLen) {
      for (let i = prevLen; i < newLen && i < sentence.length; i++) {
        if (inputValue[i] !== sentence[i]) totalErrors++;
      }
    }

    typed = inputValue;
    renderSentence();
    updateStats();

    const progress = sentence.length > 0 ? typed.length / sentence.length : 0;
    GameSocket.emit('race:typing', { position: typed.length, progress, wpm: getWpm() });

    if (typed.length >= sentence.length) {
      GameSocket.emit('race:complete', { wpm: getWpm(), time: Date.now() - startTime, charsTyped: typed.length });
    }
  }

  function handleUpdate(data) {
    if (!data.players) return;
    players = data.players;
    renderTrack();
  }

  function handleFinish(data) {
    active = false;
    if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
    if (els.typingInput) els.typingInput.disabled = true;
  }

  function getWpm() {
    const elapsed = startTime ? (Date.now() - startTime) / 60000 : 0;
    return elapsed > 0 ? Math.round((typed.length / 5) / elapsed) : 0;
  }

  function updateStats() {
    if (els.wpm) els.wpm.textContent = getWpm();
    const totalTyped = typed.length;
    let correct = 0;
    for (let i = 0; i < typed.length && i < sentence.length; i++) {
      if (typed[i] === sentence[i]) correct++;
    }
    const accuracy = totalTyped > 0 ? Math.round((correct / totalTyped) * 100) : 100;
    if (els.accuracy) els.accuracy.textContent = accuracy + '%';
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
      const ch = isSpace ? ' ' : UI.escapeHtml(sentence[i]);
      html += `<span class="char ${cls}${isSpace ? ' space' : ''}">${ch}</span>`;
    }
    els.sentenceDisplay.innerHTML = html;
  }

  function renderTrack() {
    if (!els.trackArea) return;
    const sorted = [...players].sort((a, b) => (b.progress || 0) - (a.progress || 0));
    let html = '';
    sorted.forEach((p, i) => {
      const pct = Math.min(100, Math.round((p.progress || 0) * 100));
      const isMe = p.username === myUsername;
      const place = p.finished ? `#${p.place}` : '';
      html += `<div class="race-lane${isMe ? ' race-lane-me' : ''}${p.finished ? ' race-lane-done' : ''}">
        <span class="race-lane-name">${UI.escapeHtml(p.username)}${place ? ' <span class="race-place">' + place + '</span>' : ''}</span>
        <div class="race-lane-bar"><div class="race-lane-fill" style="width:${pct}%"></div></div>
        <span class="race-lane-wpm">${p.wpm || 0} WPM</span>
      </div>`;
    });
    els.trackArea.innerHTML = html;
  }

  function reset() {
    active = false;
    inLobby = false;
    if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
    typed = '';
    sentence = '';
    startTime = null;
    players = [];
  }

  function isActive() { return active; }
  function isInLobby() { return inLobby; }
  function getInputEl() { return els.typingInput; }

  return { init, setMyUsername, handleLobbyUpdate, handleJoined, handleCountdown, handleStart, handleUpdate, handleFinish, reset, isActive, isInLobby, getInputEl };
})();
