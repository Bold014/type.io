const AscendClient = (() => {
  let active = false;
  let currentSentence = '';
  let currentInjectedRanges = [];
  let timerInterval = null;
  let startTime = null;
  let scoreboard = [];
  let lastHP = 100;
  let lastMomentum = 0;
  let lastHeight = -1;
  let myUsername = null;

  let floorHeight = 0;
  let floorGap = Infinity;
  let floorCharIndex = 0;
  let floorWarningLevel = 'none';

  const FLOOR_WARNING_GAP = 40;
  const FLOOR_DANGER_GAP = 20;
  const FLOOR_CRITICAL_GAP = 8;

  const els = {
    tierLabel: null,
    heightDisplay: null,
    timer: null,
    hpFill: null,
    hpText: null,
    hpBarArea: null,
    momentumSegments: null,
    sentenceDisplay: null,
    quoteSource: null,
    typingInput: null,
    wpm: null,
    errors: null,
    scoreboard: null,
    countdownOverlay: null,
    countdownNumber: null,
    attackNotifications: null,
    typingArea: null,
    typingPanel: null,
    screenAscend: null,
    floorVignette: null,
    fallingTextContainer: null
  };

  function cacheEls() {
    els.tierLabel = document.getElementById('ascend-tier-label');
    els.heightDisplay = document.getElementById('ascend-height-display');
    els.timer = document.getElementById('ascend-timer');
    els.hpFill = document.getElementById('ascend-hp-fill');
    els.hpText = document.getElementById('ascend-hp-text');
    els.hpBarArea = document.getElementById('ascend-hp-bar-area');
    els.momentumSegments = document.getElementById('ascend-momentum-segments');
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
    els.typingPanel = document.querySelector('.ascend-typing-panel');
    els.screenAscend = document.getElementById('screen-ascend');
    els.floorVignette = document.getElementById('ascend-floor-vignette');
    els.fallingTextContainer = document.getElementById('ascend-falling-text-container');
  }

  function reset() {
    active = false;
    currentSentence = '';
    currentInjectedRanges = [];
    scoreboard = [];
    lastHP = 100;
    lastMomentum = 0;
    lastHeight = -1;
    floorHeight = 0;
    floorGap = Infinity;
    floorCharIndex = 0;
    floorWarningLevel = 'none';
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    startTime = null;
    TypingEngine.reset();
  }

  function setMyUsername(name) {
    myUsername = name;
  }

  function handleJoined(data) {
    cacheEls();
    reset();

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

    if (data.sentence) {
      handleSentence(data);
    }
  }

  function handleSentence(data) {
    if (!active) return;
    cacheEls();

    if (currentSentence && els.sentenceDisplay) {
      spawnFallingText();
    }

    currentSentence = data.sentence;
    currentInjectedRanges = [];
    floorCharIndex = 0;

    updateTier(data.tier);
    updateHeight(data.height);
    updateHP(data.hp);
    updateMomentum(data.momentum);

    els.typingInput.value = '';
    els.typingInput.disabled = false;
    els.typingInput.focus();

    TypingEngine.start(currentSentence, {
      onUpdate: (state) => {
        if (els.wpm) {
          els.wpm.textContent = state.wpm;
          updateWpmStyle(state.wpm);
        }
        if (els.errors) {
          const total = state.uncorrectedErrors + state.correctedErrors;
          els.errors.textContent = total;
          updateErrorStyle(total);
        }
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

    if (els.wpm) {
      els.wpm.textContent = state.wpm;
      updateWpmStyle(state.wpm);
    }
    if (els.errors) {
      const total = state.uncorrectedErrors + state.correctedErrors;
      els.errors.textContent = total;
      updateErrorStyle(total);
    }

    GameSocket.emit('ascend:typing', {
      position: state.position,
      typed: state.typed,
      wpm: state.wpm,
      errors: state.uncorrectedErrors,
      corrections: state.correctedErrors
    });
  }

  function updateWpmStyle(wpm) {
    if (!els.wpm) return;
    els.wpm.classList.remove('wpm-hot', 'wpm-fire');
    if (wpm >= 100) els.wpm.classList.add('wpm-fire');
    else if (wpm >= 60) els.wpm.classList.add('wpm-hot');
  }

  function updateErrorStyle(count) {
    if (!els.errors) return;
    if (count > 0) els.errors.classList.add('errors-active');
    else els.errors.classList.remove('errors-active');
  }

  function renderSentence(charStates) {
    if (!els.sentenceDisplay) return;
    let html = '';
    for (let i = 0; i < currentSentence.length; i++) {
      let cls = charStates[i] || 'pending';
      if (isInInjectedRange(i) && (cls === 'pending' || cls === 'current')) {
        cls += ' injected';
      }
      if (floorCharIndex > 0 && (cls === 'correct' || cls.startsWith('correct '))) {
        if (i < floorCharIndex) {
          cls += ' consumed';
        } else if (i < floorCharIndex + 3) {
          cls += ' consuming';
        }
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

    triggerScreenShake();

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

  function triggerScreenShake() {
    if (!els.screenAscend) cacheEls();
    if (!els.screenAscend) return;
    els.screenAscend.classList.remove('screen-shake');
    void els.screenAscend.offsetHeight;
    els.screenAscend.classList.add('screen-shake');
    setTimeout(() => els.screenAscend.classList.remove('screen-shake'), 450);
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

  let lastScoreboardJson = '';

  function renderScoreboard(list) {
    if (!els.scoreboard) return;

    const currentJson = JSON.stringify(list);
    if (currentJson === lastScoreboardJson) return;
    lastScoreboardJson = currentJson;

    const existingRows = els.scoreboard.children;

    while (existingRows.length > list.length) {
      els.scoreboard.removeChild(els.scoreboard.lastChild);
    }

    list.forEach((p, i) => {
      const hpPct = Math.max(0, p.hp);
      const tierClass = p.tier >= 7 ? 'tier-high' : p.tier >= 4 ? 'tier-mid' : 'tier-low';
      const dotClass = p.tier >= 7 ? 'td-high' : p.tier >= 4 ? 'td-mid' : 'td-low';
      const elimClass = p.eliminated ? 'ascend-sb-eliminated' : '';
      const selfClass = myUsername && p.username === myUsername ? 'ascend-sb-self' : '';

      let row = existingRows[i];
      if (!row) {
        row = document.createElement('div');
        row.innerHTML = `
          <span class="ascend-sb-rank"><span class="ascend-sb-tier-dot"></span></span>
          <div class="ascend-sb-name-cell">
            <span class="ascend-sb-name"></span>
            <div class="ascend-sb-hp-mini"><div class="ascend-sb-hp-mini-fill"></div></div>
          </div>
          <span class="ascend-sb-height"></span>
          <span class="ascend-sb-wpm"></span>`;
        els.scoreboard.appendChild(row);
      }

      row.className = `ascend-sb-row ${tierClass} ${elimClass} ${selfClass}`.replace(/\s+/g, ' ').trim();

      const rankEl = row.querySelector('.ascend-sb-rank');
      const dotEl = row.querySelector('.ascend-sb-tier-dot');
      const nameEl = row.querySelector('.ascend-sb-name');
      const hpFill = row.querySelector('.ascend-sb-hp-mini-fill');
      const heightEl = row.querySelector('.ascend-sb-height');
      const wpmEl = row.querySelector('.ascend-sb-wpm');

      if (dotEl) dotEl.className = `ascend-sb-tier-dot ${dotClass}`;
      if (rankEl) rankEl.lastChild.textContent = i + 1;
      if (nameEl) nameEl.textContent = p.username;
      if (hpFill) hpFill.style.width = hpPct + '%';
      if (heightEl) heightEl.textContent = p.height + 'm';
      if (wpmEl) wpmEl.textContent = p.wpm || 0;
    });
  }

  function handleTierUp(data) {
    updateTier(data.tier);
    updateHeight(data.height);
    spawnNotification(`TIER ${data.tier}`, 'attack-notification ascend-tier-notification');
    spawnTierFlash();
  }

  function spawnTierFlash() {
    const flash = document.createElement('div');
    flash.className = 'ascend-tier-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 650);
  }

  function handleMomentumUp(data) {
    updateMomentum(data.momentum);
  }

  function handleHpUpdate(data) {
    cacheEls();
    updateHP(data.hp);
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

  function handleFloorUpdate(data) {
    cacheEls();
    floorHeight = data.floorHeight;
    floorGap = data.gap;

    const playerHeight = floorHeight + floorGap;
    const floorRatio = playerHeight > 0 ? floorHeight / playerHeight : 0;
    const state = TypingEngine.isActive() ? TypingEngine.getState() : null;
    const typedPos = state ? state.position : 0;
    floorCharIndex = Math.floor(typedPos * floorRatio);

    if (TypingEngine.isActive()) {
      const charStates = TypingEngine.getCharStates();
      renderSentence(charStates);
    }

    updateFloorWarning(data.gap);
  }

  function updateFloorWarning(gap) {
    if (!els.floorVignette) cacheEls();
    if (!els.screenAscend) return;

    let newLevel = 'none';
    if (gap <= FLOOR_CRITICAL_GAP) newLevel = 'critical';
    else if (gap <= FLOOR_DANGER_GAP) newLevel = 'danger';
    else if (gap <= FLOOR_WARNING_GAP) newLevel = 'warning';

    if (newLevel !== floorWarningLevel) {
      els.screenAscend.classList.remove('floor-warn', 'floor-danger', 'floor-critical');
      if (els.floorVignette) {
        els.floorVignette.classList.remove('vignette-warning', 'vignette-danger', 'vignette-critical');
      }

      if (newLevel === 'warning') {
        els.screenAscend.classList.add('floor-warn');
        if (els.floorVignette) els.floorVignette.classList.add('vignette-warning');
      } else if (newLevel === 'danger') {
        els.screenAscend.classList.add('floor-danger');
        if (els.floorVignette) els.floorVignette.classList.add('vignette-danger');
      } else if (newLevel === 'critical') {
        els.screenAscend.classList.add('floor-critical');
        if (els.floorVignette) els.floorVignette.classList.add('vignette-critical');
      }

      floorWarningLevel = newLevel;
    }
  }

  function spawnFallingText() {
    if (!els.sentenceDisplay || !els.fallingTextContainer) return;

    const spans = els.sentenceDisplay.querySelectorAll('.char');
    if (!spans.length) return;

    const containerRect = els.sentenceDisplay.getBoundingClientRect();

    const ghost = document.createElement('div');
    ghost.className = 'falling-text-group';
    ghost.style.left = containerRect.left + 'px';
    ghost.style.top = containerRect.top + 'px';
    ghost.style.width = containerRect.width + 'px';

    const maxChars = Math.min(spans.length, 60);
    for (let i = 0; i < maxChars; i++) {
      const span = spans[i];
      const clone = document.createElement('span');
      clone.className = 'falling-char';
      clone.textContent = span.textContent;
      clone.style.animationDelay = (i * 8) + 'ms';
      ghost.appendChild(clone);
    }

    els.fallingTextContainer.appendChild(ghost);
    setTimeout(() => ghost.remove(), 1400);
  }

  function handleRunEnd(data) {
    active = false;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    TypingEngine.reset();

    if (els.screenAscend) {
      els.screenAscend.classList.remove('floor-warn', 'floor-danger', 'floor-critical');
    }
    if (els.floorVignette) {
      els.floorVignette.classList.remove('vignette-warning', 'vignette-danger', 'vignette-critical');
    }
    floorWarningLevel = 'none';

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
      els.hpFill.classList.remove('hp-high', 'hp-mid', 'hp-low', 'hp-critical');
      if (val > 50) els.hpFill.classList.add('hp-high');
      else if (val > 25) els.hpFill.classList.add('hp-mid');
      else if (val > 10) els.hpFill.classList.add('hp-low');
      else els.hpFill.classList.add('hp-critical');
    }

    if (els.hpBarArea) {
      els.hpBarArea.classList.remove('hp-high', 'hp-mid', 'hp-low', 'hp-critical');
      if (val > 50) els.hpBarArea.classList.add('hp-high');
      else if (val > 25) els.hpBarArea.classList.add('hp-mid');
      else if (val > 10) els.hpBarArea.classList.add('hp-low');
      else els.hpBarArea.classList.add('hp-critical');
    }

    if (val < lastHP && els.hpBarArea) {
      els.hpBarArea.classList.remove('hp-damage');
      void els.hpBarArea.offsetHeight;
      els.hpBarArea.classList.add('hp-damage');
      setTimeout(() => els.hpBarArea.classList.remove('hp-damage'), 400);
    }

    lastHP = val;
  }

  function updateMomentum(m) {
    if (!els.momentumSegments) cacheEls();
    if (!els.momentumSegments) return;

    const segs = els.momentumSegments.querySelectorAll('.momentum-seg');
    segs.forEach((seg, i) => {
      const level = i + 1;
      const wasActive = seg.classList.contains('active');
      seg.classList.remove('active', 'tier-low', 'tier-mid', 'tier-high', 'tier-max');

      if (level <= m) {
        seg.classList.add('active');
        if (m === 10) seg.classList.add('tier-max');
        else if (level >= 7 || m >= 7) seg.classList.add('tier-high');
        else if (level >= 4 || m >= 4) seg.classList.add('tier-mid');
        else seg.classList.add('tier-low');

        if (!wasActive && m > lastMomentum) {
          seg.classList.remove('seg-pop');
          void seg.offsetHeight;
          seg.classList.add('seg-pop');
          setTimeout(() => seg.classList.remove('seg-pop'), 350);
        }
      }
    });

    updateTypingPanelGlow(m);
    lastMomentum = m;
  }

  function updateTypingPanelGlow(m) {
    if (!els.typingPanel) cacheEls();
    if (!els.typingPanel) return;
    els.typingPanel.classList.remove('momentum-glow-low', 'momentum-glow-mid', 'momentum-glow-high', 'momentum-glow-max');
    if (m === 10) els.typingPanel.classList.add('momentum-glow-max');
    else if (m >= 7) els.typingPanel.classList.add('momentum-glow-high');
    else if (m >= 4) els.typingPanel.classList.add('momentum-glow-mid');
    else if (m >= 2) els.typingPanel.classList.add('momentum-glow-low');
  }

  function updateHeight(h) {
    if (!els.heightDisplay) cacheEls();
    if (els.heightDisplay) {
      els.heightDisplay.textContent = h + 'm';
      if (h !== lastHeight && lastHeight >= 0) {
        els.heightDisplay.classList.remove('height-pop');
        void els.heightDisplay.offsetHeight;
        els.heightDisplay.classList.add('height-pop');
        setTimeout(() => els.heightDisplay.classList.remove('height-pop'), 400);
      }
      lastHeight = h;
    }
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
    cacheEls, reset, setMyUsername,
    handleJoined, startCountdown, startGame,
    handleSentence, handleInput,
    handleAttackReceived, handleAttackSent,
    handleScoreboardUpdate, handleTierUp, handleMomentumUp, handleHpUpdate,
    handleKnockout, handleEliminated, handleFloorUpdate, handleRunEnd,
    isActive, getInput
  };
})();
