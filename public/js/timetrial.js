const TimeTrial = (() => {
  let selectedDuration = 60;
  let sentence = '';
  let typed = '';
  let startTime = null;
  let corrections = 0;
  let totalErrors = 0;
  let active = false;
  let timerInterval = null;
  let statsInterval = null;
  let remaining = 0;

  const els = {
    durationSelect: null,
    gameArea: null,
    timer: null,
    wpm: null,
    accuracy: null,
    chars: null,
    sentenceDisplay: null,
    typingInput: null,
    countdownOverlay: null,
    countdownNumber: null,
    quoteSource: null
  };

  function init() {
    els.durationSelect = document.getElementById('tt-duration-select');
    els.gameArea = document.getElementById('tt-game-area');
    els.timer = document.getElementById('tt-timer');
    els.wpm = document.getElementById('tt-wpm');
    els.accuracy = document.getElementById('tt-accuracy');
    els.chars = document.getElementById('tt-chars');
    els.sentenceDisplay = document.getElementById('tt-sentence-display');
    els.typingInput = document.getElementById('tt-typing-input');
    els.countdownOverlay = document.getElementById('tt-countdown-overlay');
    els.countdownNumber = document.getElementById('tt-countdown-number');
    els.quoteSource = document.getElementById('tt-quote-source');

    document.querySelectorAll('.tt-dur-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tt-dur-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedDuration = parseInt(btn.dataset.duration);
      });
    });

    document.getElementById('btn-tt-start').addEventListener('click', startGame);

    document.getElementById('btn-tt-back').addEventListener('click', () => {
      cleanup();
      UI.showScreen('home');
    });

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

    document.getElementById('btn-tt-again').addEventListener('click', () => {
      showDurationSelect();
      UI.showScreen('timetrial');
    });

    document.getElementById('btn-tt-quit').addEventListener('click', () => {
      UI.showScreen('home');
    });
  }

  function showDurationSelect() {
    cleanup();
    els.durationSelect.style.display = '';
    els.gameArea.style.display = 'none';
    els.timer.textContent = '';
    els.countdownOverlay.style.display = 'none';
  }

  async function startGame() {
    const btn = document.getElementById('btn-tt-start');
    btn.textContent = '...';
    btn.disabled = true;

    try {
      const res = await fetch(`/api/time-trial/sentences?duration=${selectedDuration}`);
      const data = await res.json();
      sentence = data.text;

      els.durationSelect.style.display = 'none';
      els.gameArea.style.display = '';
      els.typingInput.value = '';
      els.typingInput.disabled = true;
      typed = '';
      corrections = 0;
      totalErrors = 0;
      active = false;

      if (els.quoteSource) {
        els.quoteSource.textContent = data.source ? `— ${data.source}` : '';
      }

      renderSentence();
      updateStatsDisplay();

      runCountdown(3, () => {
        beginTyping();
      });
    } catch (err) {
      console.error('Failed to start time trial:', err);
    } finally {
      btn.textContent = 'START';
      btn.disabled = false;
    }
  }

  function runCountdown(seconds, onDone) {
    els.countdownOverlay.style.display = 'flex';
    els.countdownNumber.textContent = seconds;
    els.countdownNumber.style.animation = 'none';
    void els.countdownNumber.offsetHeight;
    els.countdownNumber.style.animation = 'countPulse 0.8s ease-out';

    let count = seconds;
    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        els.countdownNumber.textContent = count;
        els.countdownNumber.style.animation = 'none';
        void els.countdownNumber.offsetHeight;
        els.countdownNumber.style.animation = 'countPulse 0.8s ease-out';
      } else {
        clearInterval(interval);
        els.countdownOverlay.style.display = 'none';
        onDone();
      }
    }, 1000);
  }

  function beginTyping() {
    active = true;
    startTime = Date.now();
    remaining = selectedDuration;
    els.typingInput.disabled = false;
    els.typingInput.focus();
    els.timer.textContent = formatTime(remaining);

    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      remaining = Math.max(0, selectedDuration - elapsed);
      els.timer.textContent = formatTime(remaining);

      if (remaining <= 0) {
        endGame();
      }
    }, 100);

    statsInterval = setInterval(() => {
      if (active) updateStatsDisplay();
    }, 400);
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
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
        if (inputValue[i] !== sentence[i]) {
          totalErrors++;
        }
      }
    }

    typed = inputValue;
    renderSentence();
    updateStatsDisplay();

    if (typed.length >= sentence.length) {
      endGame();
    }
  }

  function getStats() {
    const elapsed = startTime ? Date.now() - startTime : 0;
    const elapsedMin = elapsed / 60000;

    let correct = 0;
    let uncorrected = 0;
    for (let i = 0; i < typed.length && i < sentence.length; i++) {
      if (typed[i] === sentence[i]) {
        correct++;
      } else {
        uncorrected++;
      }
    }

    const wpm = elapsedMin > 0 ? Math.round((correct / 5) / elapsedMin) : 0;
    const totalTyped = typed.length;
    const accuracy = totalTyped > 0 ? Math.round((correct / totalTyped) * 100) : 100;

    return { wpm, accuracy, correct, uncorrected, totalTyped, elapsed, corrections };
  }

  function updateStatsDisplay() {
    const stats = getStats();
    els.wpm.textContent = stats.wpm;
    els.accuracy.textContent = stats.accuracy + '%';
    els.chars.textContent = stats.totalTyped;
  }

  function renderSentence() {
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
      const char = sentence[i] === ' ' ? ' ' : escapeHtml(sentence[i]);
      html += `<span class="char ${cls}">${char}</span>`;
    }
    els.sentenceDisplay.innerHTML = html;

    const currentEl = els.sentenceDisplay.querySelector('.char.current');
    if (currentEl) {
      currentEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function endGame() {
    if (!active) return;
    active = false;

    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }

    els.typingInput.disabled = true;
    els.timer.textContent = '0:00';

    const stats = getStats();
    showResults(stats);
  }

  async function showResults(stats) {
    document.getElementById('tt-result-wpm').textContent = stats.wpm;
    document.getElementById('tt-result-accuracy').textContent = stats.accuracy + '%';
    document.getElementById('tt-result-chars').textContent = stats.totalTyped;
    document.getElementById('tt-result-errors').textContent = stats.uncorrected;
    document.getElementById('tt-result-duration').textContent = selectedDuration + 's';

    const xpDisplay = document.getElementById('tt-xp-gain-display');
    xpDisplay.style.display = 'none';

    UI.showScreen('timetrialResult');

    try {
      const sb = window.supabase.createClient(
        'https://smnhckjzyawgzrgwzjcq.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtbmhja2p6eWF3Z3pyZ3d6amNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTI3MzksImV4cCI6MjA4NzEyODczOX0.Hpd_oSIYrCr6zv2OI1CdOpU0vVhaLFhDHRt4G0LLCnc'
      );
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/time-trial/result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          duration: selectedDuration,
          wpm: stats.wpm,
          accuracy: stats.accuracy,
          charactersTyped: stats.totalTyped,
          correctCharacters: stats.correct,
          errors: stats.uncorrected
        })
      });

      const result = await res.json();
      if (result.xp) {
        const xp = result.xp;
        document.getElementById('tt-xp-gain-amount').textContent = `+${xp.xpGained} XP`;
        const pbEl = document.getElementById('tt-xp-gain-pb');
        pbEl.style.display = xp.isPb ? '' : 'none';

        const levelupEl = document.getElementById('tt-xp-gain-levelup');
        if (xp.newLevel > xp.oldLevel) {
          levelupEl.textContent = `LEVEL UP! LV. ${xp.newLevel}`;
          levelupEl.style.display = '';
        } else {
          levelupEl.style.display = 'none';
        }

        xpDisplay.style.display = '';
      }
    } catch (_) {}
  }

  function cleanup() {
    active = false;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
    typed = '';
    sentence = '';
    startTime = null;
  }

  function isActive() { return active; }
  function getInput() { return els.typingInput; }

  return { init, showDurationSelect, isActive, getInput };
})();
