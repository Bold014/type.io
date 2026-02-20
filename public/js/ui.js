const UI = (() => {
  const screens = {
    welcome: document.getElementById('screen-welcome'),
    home: document.getElementById('screen-home'),
    matchmaking: document.getElementById('screen-matchmaking'),
    game: document.getElementById('screen-game'),
    roundResult: document.getElementById('screen-round-result'),
    matchResult: document.getElementById('screen-match-result')
  };

  const els = {
    welcomeUsername: document.getElementById('welcome-username'),
    btnJoin: document.getElementById('btn-join'),
    welcomeLoginLink: document.getElementById('welcome-login-link'),

    homeUsername: document.getElementById('home-username'),
    homeBadge: document.getElementById('home-badge'),
    btnHomeAuth: document.getElementById('btn-home-auth'),
    btnHomeLogout: document.getElementById('btn-home-logout'),
    cardQuickplay: document.getElementById('card-quickplay'),
    cardRanked: document.getElementById('card-ranked'),
    rankedSub: document.getElementById('ranked-sub'),
    rankedLock: document.getElementById('ranked-lock'),

    authModal: document.getElementById('auth-modal'),
    authModalTitle: document.getElementById('auth-modal-title'),
    authForm: document.getElementById('auth-form'),
    authUsername: document.getElementById('auth-username'),
    authPassword: document.getElementById('auth-password'),
    authError: document.getElementById('auth-error'),
    authSubmit: document.getElementById('auth-submit'),
    authCancel: document.getElementById('auth-cancel'),

    matchmakingMode: document.getElementById('matchmaking-mode'),
    btnCancelQueue: document.getElementById('btn-cancel-queue'),

    matchScore: document.getElementById('match-score'),
    roundIndicator: document.getElementById('round-indicator'),
    duelFillYou: document.getElementById('duel-fill-you'),
    duelFillOpp: document.getElementById('duel-fill-opp'),
    playerWpmBar: document.getElementById('player-wpm-bar'),
    opponentWpmBar: document.getElementById('opponent-wpm-bar'),
    opponentNameBar: document.getElementById('opponent-name-bar'),
    vsIntroOverlay: document.getElementById('vs-intro-overlay'),
    vsIntroLeft: document.getElementById('vs-intro-left'),
    vsIntroRight: document.getElementById('vs-intro-right'),
    vsIntroFlash: document.getElementById('vs-intro-flash'),
    countdownOverlay: document.getElementById('countdown-overlay'),
    countdownNumber: document.getElementById('countdown-number'),
    sentenceDisplay: document.getElementById('sentence-display'),
    typingInput: document.getElementById('typing-input'),
    playerWpm: document.getElementById('player-wpm'),
    playerErrors: document.getElementById('player-errors'),
    playerScore: document.getElementById('player-score'),
    errorFlash: document.getElementById('error-flash'),
    attackNotifications: document.getElementById('attack-notifications'),
    opponentSentenceDisplay: document.getElementById('opponent-sentence-display'),
    opponentNamePanel: document.getElementById('opponent-name-panel'),
    opponentWpmPanel: document.getElementById('opponent-wpm-panel'),
    finishTimer: document.getElementById('finish-timer'),
    finishTimerLabel: document.getElementById('finish-timer-label'),
    finishTimerCount: document.getElementById('finish-timer-count'),

    roundResultTitle: document.getElementById('round-result-title'),
    roundWinnerText: document.getElementById('round-winner-text'),
    resultYouWpm: document.getElementById('result-you-wpm'),
    resultYouErrors: document.getElementById('result-you-errors'),
    resultYouCorrections: document.getElementById('result-you-corrections'),
    resultYouScore: document.getElementById('result-you-score'),
    resultOppName: document.getElementById('result-opp-name'),
    resultOppWpm: document.getElementById('result-opp-wpm'),
    resultOppErrors: document.getElementById('result-opp-errors'),
    resultOppCorrections: document.getElementById('result-opp-corrections'),
    resultOppScore: document.getElementById('result-opp-score'),
    nextRoundText: document.getElementById('next-round-text'),

    matchResultTitle: document.getElementById('match-result-title'),
    matchWinnerText: document.getElementById('match-winner-text'),
    finalMatchScore: document.getElementById('final-match-score'),
    ratingChange: document.getElementById('rating-change'),
    btnPlayAgain: document.getElementById('btn-play-again'),
    btnQuit: document.getElementById('btn-quit')
  };

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    if (screens[name]) screens[name].classList.add('active');
  }

  function showAuthModal(mode) {
    els.authModalTitle.textContent = mode === 'login' ? 'LOG IN' : 'SIGN UP';
    els.authSubmit.textContent = mode === 'login' ? 'LOG IN' : 'SIGN UP';
    els.authError.textContent = '';
    els.authUsername.value = '';
    els.authPassword.value = '';
    els.authModal.style.display = 'flex';
    els.authModal.dataset.mode = mode;
    els.authUsername.focus();
  }

  function hideAuthModal() {
    els.authModal.style.display = 'none';
  }

  function setHomeUser(username, isLoggedIn, rating) {
    els.homeUsername.textContent = username.toUpperCase();
    if (isLoggedIn) {
      els.homeBadge.textContent = `${rating || 1000} SR`;
      els.homeBadge.className = 'home-badge ranked';
      els.btnHomeAuth.style.display = 'none';
      els.btnHomeLogout.style.display = '';
      els.rankedSub.textContent = 'Climb the leaderboard';
      els.rankedLock.style.display = 'none';
      els.cardRanked.classList.remove('disabled');
    } else {
      els.homeBadge.textContent = 'GUEST';
      els.homeBadge.className = 'home-badge';
      els.btnHomeAuth.style.display = '';
      els.btnHomeLogout.style.display = 'none';
      els.rankedSub.textContent = 'Log in to unlock ranked play';
      els.rankedLock.style.display = '';
      els.cardRanked.classList.add('disabled');
    }
  }

  function isInInjectedRange(index, ranges) {
    if (!ranges || !ranges.length) return false;
    for (const [start, end] of ranges) {
      if (index >= start && index < end) return true;
    }
    return false;
  }

  function renderSentence(sentence, charStates, injectedRanges) {
    let html = '';
    for (let i = 0; i < sentence.length; i++) {
      let cls = charStates[i] || 'pending';
      if (isInInjectedRange(i, injectedRanges) && (cls === 'pending' || cls === 'current')) {
        cls += ' injected';
      }
      const char = sentence[i] === ' ' ? ' ' : escapeHtml(sentence[i]);
      html += `<span class="char ${cls}">${char}</span>`;
    }
    els.sentenceDisplay.innerHTML = html;
  }

  function updatePlayerStats(state) {
    els.playerWpm.textContent = state.wpm;
    els.playerErrors.textContent = state.uncorrectedErrors + state.correctedErrors;
    els.playerScore.textContent = state.score;
  }

  function updateOpponent(data) {
    els.opponentWpmBar.textContent = data.wpm;
    if (els.opponentWpmPanel) els.opponentWpmPanel.textContent = data.wpm + ' WPM';
  }

  function updateDuelMeter(myProgress, oppProgress) {
    const myP = Math.max(0, Math.min(1, myProgress || 0));
    const oppP = Math.max(0, Math.min(1, oppProgress || 0));
    const total = myP + oppP;

    let split;
    if (total === 0) {
      split = 50;
    } else {
      split = (myP / total) * 100;
    }
    split = Math.max(3, Math.min(97, split));

    els.duelFillYou.style.width = `${split}%`;

    if (myP > oppP) {
      els.duelFillYou.classList.add('leading');
      els.duelFillOpp.classList.remove('leading');
    } else if (oppP > myP) {
      els.duelFillOpp.classList.add('leading');
      els.duelFillYou.classList.remove('leading');
    } else {
      els.duelFillYou.classList.remove('leading');
      els.duelFillOpp.classList.remove('leading');
    }
  }

  function showCountdown(seconds) {
    els.countdownOverlay.style.display = 'flex';
    els.countdownNumber.textContent = seconds;
    els.countdownNumber.style.animation = 'none';
    void els.countdownNumber.offsetHeight;
    els.countdownNumber.style.animation = 'countPulse 0.8s ease-out';
  }

  function hideCountdown() {
    els.countdownOverlay.style.display = 'none';
  }

  function flashError() {
    els.errorFlash.classList.add('show');
    setTimeout(() => els.errorFlash.classList.remove('show'), 150);
  }

  function setMatchHeader(myUsername, opponentUsername, matchScore, round, totalRounds) {
    const myWins = matchScore[myUsername] || 0;
    const oppWins = matchScore[opponentUsername] || 0;
    els.matchScore.textContent = `You ${myWins} — ${oppWins} ${opponentUsername}`;
    els.roundIndicator.textContent = `ROUND ${round} OF ${totalRounds}`;
  }

  function showRoundResult(data, myUsername) {
    els.roundResultTitle.textContent = `ROUND ${data.round}`;
    if (data.roundWinner === myUsername) {
      els.roundWinnerText.textContent = 'You won this round!';
      els.roundWinnerText.style.color = 'var(--green)';
    } else if (data.roundWinner) {
      els.roundWinnerText.textContent = `${data.roundWinner} won this round`;
      els.roundWinnerText.style.color = 'var(--red)';
    } else {
      els.roundWinnerText.textContent = 'Round tied!';
      els.roundWinnerText.style.color = 'var(--gold)';
    }

    els.resultYouWpm.textContent = data.you.wpm;
    els.resultYouErrors.textContent = data.you.uncorrectedErrors;
    els.resultYouCorrections.textContent = data.you.correctedErrors;
    els.resultYouScore.textContent = data.you.score;

    els.resultOppName.textContent = data.opponent.username;
    els.resultOppWpm.textContent = data.opponent.wpm;
    els.resultOppErrors.textContent = data.opponent.uncorrectedErrors;
    els.resultOppCorrections.textContent = data.opponent.correctedErrors;
    els.resultOppScore.textContent = data.opponent.score;

    els.nextRoundText.textContent = data.matchOver ? 'Match complete!' : 'Next round starting...';

    showScreen('roundResult');
  }

  function showMatchResult(data, myUsername) {
    if (data.forfeit) {
      els.matchResultTitle.textContent = 'OPPONENT DISCONNECTED';
    } else {
      els.matchResultTitle.textContent = 'MATCH OVER';
    }

    if (data.winner === myUsername) {
      els.matchWinnerText.textContent = 'YOU WIN';
      els.matchWinnerText.className = 'match-winner-text win';
    } else if (data.winner) {
      els.matchWinnerText.textContent = 'YOU LOSE';
      els.matchWinnerText.className = 'match-winner-text lose';
    } else {
      els.matchWinnerText.textContent = 'DRAW';
      els.matchWinnerText.className = 'match-winner-text draw';
    }

    const names = Object.keys(data.matchScore);
    if (names.length === 2) {
      const myScore = data.matchScore[myUsername] || 0;
      const oppName = names.find(n => n !== myUsername);
      const oppScore = data.matchScore[oppName] || 0;
      els.finalMatchScore.textContent = `${myScore}  —  ${oppScore}`;
    }

    if (data.ratingChange) {
      const delta = data.ratingChange.ratingDelta;
      const sign = delta >= 0 ? '+' : '';
      els.ratingChange.textContent = `Rating: ${data.ratingChange.newRating} (${sign}${delta})`;
      els.ratingChange.style.color = delta >= 0 ? 'var(--green)' : 'var(--red)';
    } else {
      els.ratingChange.textContent = '';
    }

    showScreen('matchResult');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showVsIntro(playerName, opponentName) {
    els.vsIntroOverlay.classList.remove('fade-out');
    els.vsIntroLeft.textContent = playerName;
    els.vsIntroRight.textContent = opponentName;

    els.vsIntroLeft.style.animation = 'none';
    els.vsIntroRight.style.animation = 'none';
    els.vsIntroFlash.style.animation = 'none';
    void els.vsIntroOverlay.offsetHeight;

    els.vsIntroLeft.style.animation = '';
    els.vsIntroRight.style.animation = '';
    els.vsIntroFlash.style.animation = '';

    els.vsIntroOverlay.style.display = 'flex';
  }

  function hideVsIntro() {
    if (els.vsIntroOverlay.style.display === 'none') return;
    els.vsIntroOverlay.classList.add('fade-out');
    setTimeout(() => {
      els.vsIntroOverlay.style.display = 'none';
      els.vsIntroOverlay.classList.remove('fade-out');
    }, 500);
  }

  function setSentenceHidden(hidden) {
    const areas = document.querySelectorAll('.typing-area');
    areas.forEach(area => {
      if (hidden) {
        area.classList.add('sentence-hidden');
      } else {
        area.classList.remove('sentence-hidden');
      }
    });
  }

  function focusInput() {
    els.typingInput.value = '';
    els.typingInput.focus();
  }

  function resetGameUI() {
    els.duelFillYou.style.width = '50%';
    els.duelFillYou.classList.remove('leading');
    els.duelFillOpp.classList.remove('leading');
    els.playerWpmBar.textContent = '0';
    els.opponentWpmBar.textContent = '0';
    els.playerWpm.textContent = '0';
    els.playerErrors.textContent = '0';
    els.playerScore.textContent = '0';
    els.typingInput.value = '';
    els.sentenceDisplay.innerHTML = '';
    if (els.opponentSentenceDisplay) els.opponentSentenceDisplay.innerHTML = '';
    if (els.opponentWpmPanel) els.opponentWpmPanel.textContent = '0 WPM';
    if (els.attackNotifications) els.attackNotifications.innerHTML = '';
  }

  function renderOpponentSentence(sentence, typed, injectedRanges) {
    if (!els.opponentSentenceDisplay) return;
    const typedStr = typed || '';
    let html = '';
    for (let i = 0; i < sentence.length; i++) {
      let cls;
      if (i < typedStr.length) {
        cls = typedStr[i] === sentence[i] ? 'correct' : 'error';
      } else if (i === typedStr.length) {
        cls = 'current';
      } else {
        cls = 'pending';
      }
      if (isInInjectedRange(i, injectedRanges) && (cls === 'pending' || cls === 'current')) {
        cls += ' injected';
      }
      const char = sentence[i] === ' ' ? ' ' : escapeHtml(sentence[i]);
      html += `<span class="char ${cls}">${char}</span>`;
    }
    els.opponentSentenceDisplay.innerHTML = html;
  }

  function flashRange(displayEl, start, end, cssClass) {
    if (!displayEl) return;
    const spans = displayEl.querySelectorAll('.char');
    for (let i = start; i < end && i < spans.length; i++) {
      spans[i].classList.add(cssClass);
    }
    setTimeout(() => {
      for (let i = start; i < end && i < spans.length; i++) {
        spans[i].classList.remove(cssClass);
      }
    }, 1500);
  }

  function flashSentenceRange(start, end, type) {
    const cssClass = type === 'scramble' ? 'scramble-flash' : 'chaos-flash';
    flashRange(els.sentenceDisplay, start, end, cssClass);
  }

  function flashOpponentRange(start, end, type) {
    const cssClass = type === 'scramble' ? 'scramble-flash' : 'chaos-flash';
    flashRange(els.opponentSentenceDisplay, start, end, cssClass);
  }

  function spawnNotification(text, className) {
    const container = els.attackNotifications;
    if (!container) return;
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    container.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  function showAttackNotification(type, word) {
    let text;
    if (type === 'inject') text = '+' + word;
    else if (type === 'scramble') text = 'SCRAMBLED!';
    else text = 'CaSe ChAoS!';
    spawnNotification(text, 'attack-notification attack-received');
  }

  function showAttackSentNotification(type) {
    let text;
    if (type === 'inject') text = '+1 INJECT';
    else if (type === 'scramble') text = '+1 SCRAMBLE';
    else text = '+1 CHAOS';
    spawnNotification(text, 'attack-notification attack-sent');
  }

  let finishTimerInterval = null;

  function showFinishTimer(seconds, label) {
    hideFinishTimer();
    els.finishTimerLabel.textContent = label;
    els.finishTimerCount.textContent = seconds;
    els.finishTimerCount.classList.toggle('urgent', seconds <= 3);
    els.finishTimer.style.display = 'flex';

    let remaining = seconds;
    finishTimerInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        hideFinishTimer();
        return;
      }
      els.finishTimerCount.textContent = remaining;
      els.finishTimerCount.classList.toggle('urgent', remaining <= 3);
    }, 1000);
  }

  function hideFinishTimer() {
    if (finishTimerInterval) {
      clearInterval(finishTimerInterval);
      finishTimerInterval = null;
    }
    if (els.finishTimer) els.finishTimer.style.display = 'none';
  }

  return {
    screens, els, showScreen, showAuthModal, hideAuthModal,
    setHomeUser, renderSentence, renderOpponentSentence, updatePlayerStats,
    updateOpponent, updateDuelMeter, showCountdown, hideCountdown, flashError,
    flashSentenceRange, flashOpponentRange,
    setMatchHeader, showRoundResult, showMatchResult,
    focusInput, resetGameUI, showAttackNotification, showAttackSentNotification,
    showVsIntro, hideVsIntro, setSentenceHidden, showFinishTimer, hideFinishTimer
  };
})();
