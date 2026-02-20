const AscendClient = (() => {
  let active = false;
  let currentSentence = '';
  let currentInjectedRanges = [];
  let timerInterval = null;
  let startTime = null;
  let scoreboard = [];

  const els = {
    tierLabel: null,
    heightDisplay: null,
    timer: null,
    hpFill: null,
    hpText: null,
    momentumFill: null,
    momentumText: null,
    burnoutBanner: null,
    burnoutText: null,
    sentenceDisplay: null,
    quoteSource: null,
    typingInput: null,
    wpm: null,
    errors: null,
    scoreboard: null,
    countdownOverlay: null,
    countdownNumber: null,
    attackNotifications: null,
    typingArea: null
  };

  function cacheEls() {
    els.tierLabel = document.getElementById('ascend-tier-label');
    els.heightDisplay = document.getElementById('ascend-height-display');
    els.timer = document.getElementById('ascend-timer');
    els.hpFill = document.getElementById('ascend-hp-fill');
    els.hpText = document.getElementById('ascend-hp-text');
    els.momentumFill = document.getElementById('ascend-momentum-fill');
    els.momentumText = document.getElementById('ascend-momentum-text');
    els.burnoutBanner = document.getElementById('ascend-burnout-banner');
    els.burnoutText = document.getElementById('ascend-burnout-text');
    els.sentenceDisplay = document.getElementById('ascend-sentence-display');
    els.quoteSource = document.getElementById('ascend-quote-source');
    els.typingInput = document.getElementById('ascend-typing-input');
    els.wpm = document.getElementById('ascend-wpm');
    els.errors = document.getElementById('ascend-errors');
    els.scoreboard = document.getElementById('ascend-scoreboard');
    els.countdownOverlay = document.getElementById('ascend-countdown-overlay');
    els.countdownNumber = document.getElementById('ascend-countdown-number');
    els.attackNotifications = document.getElementById('ascend-attack-notifications');
    els.typingArea = document.getElementById('ascend-typing-area');
  }

  function reset() {
    active = false;
    currentSentence = '';
    currentInjectedRanges = [];
    scoreboard = [];
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    startTime = null;
    TypingEngine.reset();
  }

  function handleJoined(data) {
    cacheEls();
    reset();

    if (els.burnoutBanner) els.burnoutBanner.style.display = 'none';
    updateHP(100);
    updateMomentum(1);
    updateHeight(0);
    updateTier(1);
    renderScoreboard(data.scoreboard || []);
  }

  function startCountdown(data) {
    cacheEls();

    let count = data.seconds;
    els.countdownOverlay.style.display = 'flex';
    els.countdownNumber.textContent = count;
    els.countdownNumber.style.animation = 'none';
    void els.countdownNumber.offsetHeight;
    els.countdownNumber.style.animation = 'countPulse 0.8s ease-out';

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        els.countdownNumber.textContent = count;
        els.countdownNumber.style.animation = 'none';
        void els.countdownNumber.offsetHeight;
        els.countdownNumber.style.animation = 'countPulse 0.8s ease-out';
      } else {
        clearInterval(interval);
      }
    }, 1000);
  }

  function startGame(data) {
    cacheEls();
    active = true;
    startTime = data.startTime;

    els.countdownOverlay.style.display = 'none';
    els.typingInput.value = '';
    els.typingInput.disabled = false;
    els.typingInput.focus();

    timerInterval = setInterval(() => {
      if (!startTime) return;
      const elapsed = Date.now() - startTime;
      const totalSec = Math.floor(elapsed / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      els.timer.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
    }, 1000);
  }

  function handleSentence(data) {
    if (!active) return;
    cacheEls();

    currentSentence = data.sentence;
    currentInjectedRanges = [];

    updateTier(data.tier);
    updateHeight(data.height);
    updateHP(data.hp);
    updateMomentum(data.momentum);

    els.typingInput.value = '';
    els.typingInput.disabled = false;
    els.typingInput.focus();

    TypingEngine.start(currentSentence, {
      onUpdate: (state) => {
        if (els.wpm) els.wpm.textContent = state.wpm;
        if (els.errors) els.errors.textContent = state.uncorrectedErrors + state.correctedErrors;
      },
      onComplete: (state) => {
        els.typingInput.disabled = true;
        GameSocket.emit('ascend:sentence:complete', {
          typed: state.typed,
          wpm: state.wpm,
          corrections: state.correctedErrors,
          time: state.time
        });
      }
    });

    const charStates = TypingEngine.getCharStates();
    renderSentence(charStates);

    if (els.quoteSource) {
      els.quoteSource.textContent = data.source ? `— ${data.source}` : '';
    }
  }

  function handleInput() {
    if (!active || !TypingEngine.isActive()) return;
    cacheEls();

    TypingEngine.handleInput(els.typingInput.value);
    const state = TypingEngine.getState();
    const charStates = TypingEngine.getCharStates();

    renderSentence(charStates);

    if (els.wpm) els.wpm.textContent = state.wpm;
    if (els.errors) els.errors.textContent = state.uncorrectedErrors + state.correctedErrors;

    GameSocket.emit('ascend:typing', {
      position: state.position,
      typed: state.typed,
      wpm: state.wpm,
      errors: state.uncorrectedErrors,
      corrections: state.correctedErrors
    });
  }

  function renderSentence(charStates) {
    if (!els.sentenceDisplay) return;
    let html = '';
    for (let i = 0; i < currentSentence.length; i++) {
      let cls = charStates[i] || 'pending';
      if (isInInjectedRange(i) && (cls === 'pending' || cls === 'current')) {
        cls += ' injected';
      }
      const char = currentSentence[i] === ' ' ? ' ' : escapeHtml(currentSentence[i]);
      html += `<span class="char ${cls}">${char}</span>`;
    }
    els.sentenceDisplay.innerHTML = html;
  }

  function isInInjectedRange(index) {
    for (const [start, end] of currentInjectedRanges) {
      if (index >= start && index < end) return true;
    }
    return false;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function handleAttackReceived(data) {
    if (!active) return;
    cacheEls();

    currentSentence = data.updatedSentence;
    if (data.injectedRanges) currentInjectedRanges = data.injectedRanges;
    TypingEngine.updateSentence(currentSentence);
    const charStates = TypingEngine.getCharStates();
    renderSentence(charStates);
    updateHP(data.hp);

    let text;
    if (data.type === 'inject') text = '+' + (data.word || '???');
    else if (data.type === 'scramble') text = 'SCRAMBLED!';
    else text = 'CaSe ChAoS!';
    spawnNotification(text, 'attack-notification attack-received');

    if (data.range) {
      const cssClass = data.type === 'scramble' ? 'scramble-flash' : 'chaos-flash';
      const spans = els.sentenceDisplay.querySelectorAll('.char');
      for (let i = data.range[0]; i < data.range[1] && i < spans.length; i++) {
        spans[i].classList.add(cssClass);
      }
      setTimeout(() => {
        for (let i = data.range[0]; i < data.range[1] && i < spans.length; i++) {
          spans[i].classList.remove(cssClass);
        }
      }, 1500);
    }
  }

  function handleAttackSent(data) {
    cacheEls();
    let text;
    if (data.type === 'inject') text = `+1 INJECT → ${data.target}`;
    else if (data.type === 'scramble') text = `+1 SCRAMBLE → ${data.target}`;
    else text = `+1 CHAOS → ${data.target}`;
    spawnNotification(text, 'attack-notification attack-sent');
  }

  function spawnNotification(text, className) {
    if (!els.attackNotifications) return;
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    els.attackNotifications.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  function handleScoreboardUpdate(data) {
    scoreboard = data.scoreboard;
    renderScoreboard(scoreboard);
  }

  function renderScoreboard(list) {
    if (!els.scoreboard) return;
    let html = '';
    list.forEach((p, i) => {
      const hpPct = Math.max(0, p.hp);
      const elim = p.eliminated ? ' ascend-sb-eliminated' : '';
      html += `<div class="ascend-sb-row${elim}">
        <span class="ascend-sb-rank">${i + 1}</span>
        <span class="ascend-sb-name">${escapeHtml(p.username)}</span>
        <span class="ascend-sb-height">${p.height}m</span>
        <span class="ascend-sb-tier">T${p.tier}</span>
        <div class="ascend-sb-hp-track"><div class="ascend-sb-hp-fill" style="width:${hpPct}%"></div></div>
        <span class="ascend-sb-wpm">${p.wpm || 0}</span>
      </div>`;
    });
    els.scoreboard.innerHTML = html;
  }

  function handleTierUp(data) {
    updateTier(data.tier);
    updateHeight(data.height);
    spawnNotification(`TIER ${data.tier}`, 'attack-notification ascend-tier-notification');
  }

  function handleMomentumUp(data) {
    updateMomentum(data.momentum);
    spawnNotification(`MOMENTUM ${data.momentum}`, 'attack-notification attack-sent');
  }

  function handleKnockout(data) {
    cacheEls();
    updateHP(data.hp);
    updateHeight(data.height);
    spawnNotification(`KNOCKOUT: ${data.victim}`, 'attack-notification ascend-ko-notification');
  }

  function handleEliminated(data) {
    cacheEls();
    spawnNotification(`${data.username} ${data.disconnected ? 'DISCONNECTED' : 'ELIMINATED'}`, 'attack-notification attack-received');
  }

  function handleBurnout(data) {
    cacheEls();
    if (els.burnoutBanner) {
      els.burnoutBanner.style.display = '';
      els.burnoutText.textContent = data.message;
    }
  }

  function handleRunEnd(data) {
    active = false;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    TypingEngine.reset();

    const rTitle = document.getElementById('ascend-result-title');
    const rStatus = document.getElementById('ascend-result-status');
    const rHeight = document.getElementById('ascend-result-height');
    const rTier = document.getElementById('ascend-result-tier');
    const rDuration = document.getElementById('ascend-result-duration');
    const rKnockouts = document.getElementById('ascend-result-knockouts');

    if (rTitle) rTitle.textContent = 'RUN COMPLETE';
    if (rStatus) {
      rStatus.textContent = 'ELIMINATED';
      rStatus.className = 'match-winner-text lose';
    }
    if (rHeight) rHeight.textContent = data.height;
    if (rTier) rTier.textContent = data.tier;
    if (rKnockouts) rKnockouts.textContent = data.knockouts || 0;
    if (rDuration) {
      const totalSec = Math.floor((data.duration || 0) / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      rDuration.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
    }

    const xpDisplay = document.getElementById('ascend-xp-gain-display');
    if (data.xpGain && xpDisplay) {
      document.getElementById('ascend-xp-gain-amount').textContent = `+${data.xpGain.xpGained} XP`;
      const pb = document.getElementById('ascend-xp-gain-pb');
      if (pb) pb.style.display = data.xpGain.isPb ? '' : 'none';
      const lu = document.getElementById('ascend-xp-gain-levelup');
      if (lu) {
        if (data.xpGain.newLevel > data.xpGain.oldLevel) {
          lu.textContent = `LEVEL UP! LV. ${data.xpGain.newLevel}`;
          lu.style.display = '';
        } else {
          lu.style.display = 'none';
        }
      }
      xpDisplay.style.display = '';
    } else if (xpDisplay) {
      xpDisplay.style.display = 'none';
    }

    UI.showScreen('ascendResult');
  }

  function updateHP(hp) {
    if (!els.hpFill) cacheEls();
    const val = Math.max(0, Math.min(100, Math.round(hp)));
    if (els.hpFill) els.hpFill.style.width = val + '%';
    if (els.hpText) els.hpText.textContent = val;

    if (els.hpFill) {
      if (val <= 25) els.hpFill.classList.add('critical');
      else els.hpFill.classList.remove('critical');
    }
  }

  function updateMomentum(m) {
    if (!els.momentumFill) cacheEls();
    const pct = (m / 10) * 100;
    if (els.momentumFill) els.momentumFill.style.width = pct + '%';
    if (els.momentumText) els.momentumText.textContent = m;
  }

  function updateHeight(h) {
    if (!els.heightDisplay) cacheEls();
    if (els.heightDisplay) els.heightDisplay.textContent = h + 'm';
  }

  function updateTier(t) {
    if (!els.tierLabel) cacheEls();
    if (els.tierLabel) els.tierLabel.textContent = 'TIER ' + t;
  }

  function isActive() { return active; }

  function getInput() {
    cacheEls();
    return els.typingInput;
  }

  return {
    cacheEls, reset,
    handleJoined, startCountdown, startGame,
    handleSentence, handleInput,
    handleAttackReceived, handleAttackSent,
    handleScoreboardUpdate, handleTierUp, handleMomentumUp,
    handleKnockout, handleEliminated, handleBurnout, handleRunEnd,
    isActive, getInput
  };
})();
