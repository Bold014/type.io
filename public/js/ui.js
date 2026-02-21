const UI = (() => {
  function getRankTier(rating) {
    if (rating >= 1700) return { name: 'Diamond', color: '#a29bfe' };
    if (rating >= 1400) return { name: 'Platinum', color: '#00cec9' };
    if (rating >= 1100) return { name: 'Gold', color: '#ffd700' };
    if (rating >= 800) return { name: 'Silver', color: '#c0c0c0' };
    return { name: 'Bronze', color: '#cd7f32' };
  }

  // --- XP / LEVEL SYSTEM ---

  const RAINBOW = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6'];
  const SHAPES = ['circle','triangle','diamond','pentagon','hexagon'];

  function xpToLevel(xp) {
    return Math.floor(
      Math.pow(xp / 500, 0.6) + xp / 5000 + Math.max(0, xp - 4000000) / 5000 + 1
    );
  }

  function xpForLevel(level) {
    if (level <= 1) return 0;
    let lo = 0, hi = 200000000;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (xpToLevel(mid) >= level) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  function getLevelBadge(level) {
    const colorIdx = Math.floor((level % 100) / 10) % RAINBOW.length;
    const shapeIdx = Math.floor((level % 500) / 100) % SHAPES.length;
    const tagColorIdx = Math.floor(level / 500) % RAINBOW.length;
    return {
      shape: SHAPES[shapeIdx],
      shapeColor: RAINBOW[colorIdx],
      tagColor: level >= 500 ? RAINBOW[tagColorIdx] : RAINBOW[colorIdx]
    };
  }

  function buildBadgeSvg(shape, color, size) {
    const s = size || 22;
    const half = s / 2;
    let path;
    switch (shape) {
      case 'triangle':
        path = `<polygon points="${half},${s*0.1} ${s*0.9},${s*0.85} ${s*0.1},${s*0.85}" fill="${color}" />`;
        break;
      case 'diamond':
        path = `<polygon points="${half},${s*0.05} ${s*0.9},${half} ${half},${s*0.95} ${s*0.1},${half}" fill="${color}" />`;
        break;
      case 'pentagon': {
        const pts = [];
        for (let i = 0; i < 5; i++) {
          const a = (Math.PI * 2 * i / 5) - Math.PI / 2;
          pts.push(`${half + half * 0.85 * Math.cos(a)},${half + half * 0.85 * Math.sin(a)}`);
        }
        path = `<polygon points="${pts.join(' ')}" fill="${color}" />`;
        break;
      }
      case 'hexagon': {
        const pts = [];
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI * 2 * i / 6) - Math.PI / 6;
          pts.push(`${half + half * 0.85 * Math.cos(a)},${half + half * 0.85 * Math.sin(a)}`);
        }
        path = `<polygon points="${pts.join(' ')}" fill="${color}" />`;
        break;
      }
      default:
        path = `<circle cx="${half}" cy="${half}" r="${half * 0.75}" fill="${color}" />`;
    }
    return `<svg viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">${path}</svg>`;
  }

  function getLevelUpMessage(newLevel) {
    if (newLevel % 500 === 0) return 'DISTINGUISHED!';
    if (newLevel % 100 === 0) return 'PROMOTED!';
    if (newLevel % 10 === 0) return 'BADGE UP!';
    return 'LEVEL UP!';
  }

  function renderHeaderLevel(xp) {
    if (!els.homeLevelPill) return;
    const level = xpToLevel(xp || 0);
    const badge = getLevelBadge(level);

    els.homeLevelBadgeIcon.innerHTML = buildBadgeSvg(badge.shape, badge.shapeColor, 16);
    els.homeLevelNum.textContent = level;
    els.homeLevelNum.style.color = badge.tagColor;
    els.homeLevelPill.style.display = '';
  }

  function hideHeaderLevel() {
    if (els.homeLevelPill) els.homeLevelPill.style.display = 'none';
  }

  function showXpGain(xpGainData) {
    if (!els.xpGainDisplay || !xpGainData) {
      if (els.xpGainDisplay) els.xpGainDisplay.style.display = 'none';
      return;
    }

    els.xpGainAmount.textContent = `+${xpGainData.xpGained} XP`;
    els.xpGainPb.style.display = xpGainData.isPb ? '' : 'none';

    if (xpGainData.newLevel > xpGainData.oldLevel) {
      const msg = getLevelUpMessage(xpGainData.newLevel);
      const badge = getLevelBadge(xpGainData.newLevel);
      els.xpGainLevelup.textContent = `${msg} LV. ${xpGainData.newLevel}`;
      els.xpGainLevelup.style.color = badge.tagColor;
      els.xpGainLevelup.style.display = '';
    } else {
      els.xpGainLevelup.style.display = 'none';
    }

    els.xpGainDisplay.style.display = '';
  }

  function showLevelUp(oldLevel, newLevel) {
    if (!els.levelupOverlay || newLevel <= oldLevel) return;

    const badge = getLevelBadge(newLevel);
    const msg = getLevelUpMessage(newLevel);

    els.levelupBadge.innerHTML = buildBadgeSvg(badge.shape, badge.shapeColor, 80);
    els.levelupBadge.style.color = badge.shapeColor;
    els.levelupMessage.textContent = msg;
    els.levelupMessage.style.color = badge.tagColor;
    els.levelupLevel.textContent = `LV. ${newLevel}`;
    els.levelupLevel.style.color = badge.tagColor;
    els.levelupLevel.style.textShadow = `0 0 24px ${badge.tagColor}60`;

    els.levelupOverlay.classList.remove('fade-out');
    els.levelupOverlay.style.display = 'flex';

    setTimeout(() => {
      els.levelupOverlay.classList.add('fade-out');
      setTimeout(() => {
        els.levelupOverlay.style.display = 'none';
        els.levelupOverlay.classList.remove('fade-out');
      }, 500);
    }, 2500);
  }

  const PLACEHOLDER_EMAIL_SUFFIX = '@noemail.typeduel.io';

  function isPlaceholderEmail(email) {
    return !email || email.endsWith(PLACEHOLDER_EMAIL_SUFFIX);
  }

  const screens = {
    welcome: document.getElementById('screen-welcome'),
    home: document.getElementById('screen-home'),
    multiplayer: document.getElementById('screen-multiplayer'),
    singleplayer: document.getElementById('screen-singleplayer'),
    profile: document.getElementById('screen-profile'),
    leaderboard: document.getElementById('screen-leaderboard'),
    matchmaking: document.getElementById('screen-matchmaking'),
    game: document.getElementById('screen-game'),
    roundResult: document.getElementById('screen-round-result'),
    matchResult: document.getElementById('screen-match-result'),
    timetrial: document.getElementById('screen-timetrial'),
    timetrialResult: document.getElementById('screen-timetrial-result'),
    ascendLobby: document.getElementById('screen-ascend-lobby'),
    ascend: document.getElementById('screen-ascend'),
    ascendResult: document.getElementById('screen-ascend-result')
  };

  const els = {
    welcomeUsername: document.getElementById('welcome-username'),
    welcomeHeading: document.getElementById('welcome-heading'),
    welcomeDesc: document.getElementById('welcome-desc'),
    welcomeStep1: document.getElementById('welcome-step-1'),
    welcomeStepSignup: document.getElementById('welcome-step-signup'),
    welcomeStepLogin: document.getElementById('welcome-step-login'),
    btnContinue: document.getElementById('btn-continue'),
    welcomeUsernameLocked: document.getElementById('welcome-username-locked'),
    welcomeUsernameLockedLogin: document.getElementById('welcome-username-locked-login'),
    welcomeEmail: document.getElementById('welcome-email'),
    welcomePassword: document.getElementById('welcome-password'),
    welcomePasswordLogin: document.getElementById('welcome-password-login'),
    welcomeError: document.getElementById('welcome-error'),
    welcomeErrorLogin: document.getElementById('welcome-error-login'),
    btnCreateAccount: document.getElementById('btn-create-account'),
    btnSignIn: document.getElementById('btn-sign-in'),
    btnBackSignup: document.getElementById('btn-back-signup'),
    btnBackLogin: document.getElementById('btn-back-login'),

    homeUserInfo: document.getElementById('home-user-info'),
    homeUsername: document.getElementById('home-username'),
    homeBadge: document.getElementById('home-badge'),
    btnHomeAuth: document.getElementById('btn-home-auth'),
    btnHomeLogout: document.getElementById('btn-home-logout'),
    btnLandingMultiplayer: document.getElementById('btn-landing-multiplayer'),
    btnLandingSingleplayer: document.getElementById('btn-landing-singleplayer'),
    btnLandingLeaderboard: document.getElementById('btn-landing-leaderboard'),
    btnMultiplayerBack: document.getElementById('btn-multiplayer-back'),
    btnSingleplayerBack: document.getElementById('btn-singleplayer-back'),
    cardQuickplay: document.getElementById('card-quickplay'),
    cardRanked: document.getElementById('card-ranked'),
    cardAscend: document.getElementById('card-ascend'),
    cardLeaderboard: document.getElementById('card-leaderboard'),
    cardTimeTrial: document.getElementById('card-timetrial'),
    rankedSub: document.getElementById('ranked-sub'),
    rankedLock: document.getElementById('ranked-lock'),

    btnAscendLobbyBack: document.getElementById('btn-ascend-lobby-back'),
    btnAscendLobbyStart: document.getElementById('btn-ascend-lobby-start'),

    btnLeaderboardBack: document.getElementById('btn-leaderboard-back'),
    lbTableBody: document.getElementById('lb-table-body'),

    btnProfileBack: document.getElementById('btn-profile-back'),
    profileUsername: document.getElementById('profile-username'),
    profileRankBadge: document.getElementById('profile-rank-badge'),
    profileSr: document.getElementById('profile-sr'),
    profileBestWpm: document.getElementById('profile-best-wpm'),
    profileWins: document.getElementById('profile-wins'),
    profileLosses: document.getElementById('profile-losses'),
    profileWinRate: document.getElementById('profile-winrate'),
    profileAvgWpm: document.getElementById('profile-avg-wpm'),
    profileGamesPlayed: document.getElementById('profile-games-played'),
    profileEmailCurrent: document.getElementById('profile-email-current'),
    profileEmailHint: document.getElementById('profile-email-hint'),
    profileEmailInput: document.getElementById('profile-email-input'),
    profileEmailError: document.getElementById('profile-email-error'),
    profileEmailSuccess: document.getElementById('profile-email-success'),
    btnProfileSaveEmail: document.getElementById('btn-profile-save-email'),
    btnProfileLogoutHeader: document.getElementById('btn-profile-logout-header'),
    profileHomeUsername: document.getElementById('profile-home-username'),
    profileHomeBadge: document.getElementById('profile-home-badge'),
    profileAscendHeight: document.getElementById('profile-ascend-height'),
    profileAscendTier: document.getElementById('profile-ascend-tier'),
    profileAscendRuns: document.getElementById('profile-ascend-runs'),
    profileAscendAvg: document.getElementById('profile-ascend-avg'),
    profileTtBest15: document.getElementById('profile-tt-best-15'),
    profileTtBest30: document.getElementById('profile-tt-best-30'),
    profileTtBest60: document.getElementById('profile-tt-best-60'),
    profileTtBest120: document.getElementById('profile-tt-best-120'),
    profileTtRuns: document.getElementById('profile-tt-runs'),
    profileTtAvg: document.getElementById('profile-tt-avg'),
    profileHistoryBody: document.getElementById('profile-history-body'),
    lbDurationFilter: document.getElementById('lb-duration-filter'),

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
    btnQuit: document.getElementById('btn-quit'),

    homeLevelPill: document.getElementById('home-level-pill'),
    homeLevelBadgeIcon: document.getElementById('home-level-badge-icon'),
    homeLevelNum: document.getElementById('home-level-num'),

    profileXpBadgeIcon: document.getElementById('profile-xp-badge-icon'),
    profileXpLevelNum: document.getElementById('profile-xp-level-num'),
    profileXpPct: document.getElementById('profile-xp-pct'),
    profileXpBarFill: document.getElementById('profile-xp-bar-fill'),
    profileXpTotal: document.getElementById('profile-xp-total'),
    profileXpCurrent: document.getElementById('profile-xp-current'),
    profileXpRemaining: document.getElementById('profile-xp-remaining'),
    xpGainDisplay: document.getElementById('xp-gain-display'),
    xpGainAmount: document.getElementById('xp-gain-amount'),
    xpGainPb: document.getElementById('xp-gain-pb'),
    xpGainLevelup: document.getElementById('xp-gain-levelup'),
    levelupOverlay: document.getElementById('levelup-overlay'),
    levelupBadge: document.getElementById('levelup-badge'),
    levelupMessage: document.getElementById('levelup-message'),
    levelupLevel: document.getElementById('levelup-level'),

    btnAscendAgain: document.getElementById('btn-ascend-again'),
    btnAscendQuit: document.getElementById('btn-ascend-quit'),
    btnAscendExit: document.getElementById('btn-ascend-exit')
  };

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    if (screens[name]) {
      screens[name].classList.add('active');
      if (window.APP_CONFIG && window.APP_CONFIG.adsEnabled) {
        screens[name].querySelectorAll('.adsbygoogle:not([data-ad-status])').forEach(() => {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        });
      }
    }
  }

  function showWelcomeStep(step, username) {
    els.welcomeStep1.style.display = step === 'username' ? '' : 'none';
    els.welcomeStepSignup.style.display = step === 'signup' ? '' : 'none';
    els.welcomeStepLogin.style.display = step === 'login' ? '' : 'none';

    if (step === 'signup') {
      els.welcomeUsernameLocked.textContent = username;
      els.welcomeEmail.value = '';
      els.welcomePassword.value = '';
      els.welcomeError.textContent = '';
      els.welcomeDesc.style.display = 'none';
      els.welcomeEmail.focus();
    } else if (step === 'login') {
      els.welcomeUsernameLockedLogin.textContent = username;
      els.welcomePasswordLogin.value = '';
      els.welcomeErrorLogin.textContent = '';
      els.welcomeDesc.style.display = 'none';
      els.welcomePasswordLogin.focus();
    } else {
      els.welcomeDesc.style.display = '';
      els.welcomeUsername.value = '';
      els.welcomeUsername.focus();
    }
  }

  function setHomeUser(username, isLoggedIn, rating, xp) {
    els.homeUsername.textContent = username.toUpperCase();
    if (isLoggedIn) {
      const tier = getRankTier(rating || 1000);
      els.homeBadge.textContent = `${tier.name.toUpperCase()} — ${rating || 1000} SR`;
      els.homeBadge.className = 'home-badge ranked';
      els.homeBadge.style.color = tier.color;
      els.homeBadge.style.background = tier.color + '1a';
      els.homeBadge.style.boxShadow = `0 0 12px ${tier.color}1a`;
      els.btnHomeAuth.style.display = 'none';
      els.btnHomeLogout.style.display = '';
      els.rankedSub.textContent = 'Climb the leaderboard';
      els.rankedLock.style.display = 'none';
      els.cardRanked.classList.remove('disabled');
      renderHeaderLevel(xp || 0);
    } else {
      els.homeBadge.textContent = 'GUEST';
      els.homeBadge.className = 'home-badge';
      els.homeBadge.style.color = '';
      els.homeBadge.style.background = '';
      els.homeBadge.style.boxShadow = '';
      els.btnHomeAuth.style.display = '';
      els.btnHomeLogout.style.display = 'none';
      els.rankedSub.textContent = 'Log in to unlock ranked play';
      els.rankedLock.style.display = '';
      els.cardRanked.classList.add('disabled');
      hideHeaderLevel();
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

  function showTimeTrialProfile(ttStats) {
    if (!ttStats) return;
    const durations = [15, 30, 60, 120];
    const elMap = {
      15: els.profileTtBest15,
      30: els.profileTtBest30,
      60: els.profileTtBest60,
      120: els.profileTtBest120
    };
    for (const d of durations) {
      const el = elMap[d];
      if (!el) continue;
      const best = ttStats.bestByDuration && ttStats.bestByDuration[d];
      el.textContent = best ? best.wpm : '—';
    }
    if (els.profileTtRuns) els.profileTtRuns.textContent = ttStats.totalRuns || 0;
    if (els.profileTtAvg) els.profileTtAvg.textContent = ttStats.avgWpm || 0;
  }

  function showProfile(profile, ascendStats, matchHistory, ttStats) {
    const tier = getRankTier(profile.rating || 1000);

    els.profileUsername.textContent = (profile.username || '').toUpperCase();
    els.profileHomeUsername.textContent = (profile.username || '').toUpperCase();
    els.profileHomeBadge.textContent = `${tier.name.toUpperCase()} — ${profile.rating || 1000} SR`;
    els.profileHomeBadge.className = 'home-badge ranked';
    els.profileHomeBadge.style.color = tier.color;
    els.profileHomeBadge.style.background = tier.color + '1a';
    els.profileHomeBadge.style.boxShadow = `0 0 12px ${tier.color}1a`;

    els.profileRankBadge.textContent = tier.name.toUpperCase();
    els.profileRankBadge.style.color = tier.color;
    els.profileRankBadge.style.borderColor = tier.color;
    els.profileRankBadge.style.textShadow = `0 0 10px ${tier.color}40`;
    els.profileSr.textContent = profile.rating || 1000;

    const xp = profile.xp || 0;
    const level = xpToLevel(xp);
    const currentLevelXp = xpForLevel(level);
    const nextLevelXp = xpForLevel(level + 1);
    const levelProgress = nextLevelXp > currentLevelXp
      ? (xp - currentLevelXp) / (nextLevelXp - currentLevelXp)
      : 0;
    const progressPct = Math.max(0, Math.min(100, levelProgress * 100));
    const badge = getLevelBadge(level);

    els.profileXpBadgeIcon.innerHTML = buildBadgeSvg(badge.shape, badge.shapeColor, 28);
    els.profileXpLevelNum.textContent = level;
    els.profileXpLevelNum.style.color = badge.tagColor;
    els.profileXpPct.textContent = `${Math.round(progressPct)}%`;
    els.profileXpBarFill.style.width = `${progressPct}%`;
    els.profileXpTotal.textContent = xp.toLocaleString();
    els.profileXpCurrent.textContent = `${(xp - currentLevelXp).toLocaleString()} / ${(nextLevelXp - currentLevelXp).toLocaleString()}`;
    els.profileXpRemaining.textContent = (nextLevelXp - xp).toLocaleString();

    els.profileBestWpm.textContent = Math.round(profile.best_wpm || 0);
    els.profileWins.textContent = profile.wins || 0;
    els.profileLosses.textContent = profile.losses || 0;
    const total = (profile.wins || 0) + (profile.losses || 0);
    els.profileWinRate.textContent = total > 0 ? Math.round((profile.wins / total) * 100) + '%' : '—';
    els.profileAvgWpm.textContent = Math.round(profile.avg_wpm || 0);
    els.profileGamesPlayed.textContent = profile.games_played || 0;

    if (ascendStats) {
      els.profileAscendHeight.textContent = ascendStats.bestHeight ? ascendStats.bestHeight.toFixed(1) + 'm' : '0';
      els.profileAscendTier.textContent = ascendStats.bestTier || 0;
      els.profileAscendRuns.textContent = ascendStats.totalRuns || 0;
      els.profileAscendAvg.textContent = ascendStats.avgHeight ? ascendStats.avgHeight + 'm' : '0';
    }

    showTimeTrialProfile(ttStats);
    renderMatchHistory(matchHistory || []);

    if (isPlaceholderEmail(profile.email)) {
      els.profileEmailCurrent.textContent = 'No email set';
      els.profileEmailCurrent.style.color = 'var(--text-dim)';
      els.profileEmailHint.textContent = 'Add an email to enable password recovery';
      els.profileEmailHint.style.display = '';
    } else {
      els.profileEmailCurrent.textContent = profile.email;
      els.profileEmailCurrent.style.color = 'var(--text)';
      els.profileEmailHint.textContent = '';
      els.profileEmailHint.style.display = 'none';
    }

    els.profileEmailInput.value = '';
    els.profileEmailError.textContent = '';
    els.profileEmailSuccess.textContent = '';

    showScreen('profile');
  }

  function renderMatchHistory(matches) {
    if (!els.profileHistoryBody) return;

    if (!matches || matches.length === 0) {
      els.profileHistoryBody.innerHTML = '<div class="profile-history-empty">No matches yet</div>';
      return;
    }

    let html = '';
    for (const m of matches) {
      const resultClass = m.won ? 'ph-win' : 'ph-loss';
      const resultText = m.won ? 'WIN' : 'LOSS';
      const modeText = m.mode === 'ranked' ? 'Ranked' : 'Quick';
      const srText = m.rating_change != null ? (m.rating_change >= 0 ? '+' + m.rating_change : '' + m.rating_change) : '—';
      const srClass = m.rating_change > 0 ? 'ph-sr-pos' : m.rating_change < 0 ? 'ph-sr-neg' : '';
      const date = new Date(m.created_at);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      html += `<div class="profile-history-row">
        <span class="ph-col-result ${resultClass}">${resultText}</span>
        <span class="ph-col-opponent">${escapeHtml(m.opponent_username)}</span>
        <span class="ph-col-mode">${modeText}</span>
        <span class="ph-col-wpm">${Math.round(m.user_wpm)}</span>
        <span class="ph-col-sr ${srClass}">${srText}</span>
        <span class="ph-col-date">${dateStr}</span>
      </div>`;
    }
    els.profileHistoryBody.innerHTML = html;
  }

  function showLeaderboard(data, category) {
    if (!els.lbTableBody) return;

    const categoryLabels = {
      rating: 'SR',
      best_wpm: 'WPM',
      wins: 'WINS',
      xp: 'LEVEL',
      ascend: 'HEIGHT',
      time_trial: 'WPM'
    };

    const headerStat = document.querySelector('.lb-col-stat');
    if (headerStat) headerStat.textContent = categoryLabels[category] || 'VALUE';

    const headerTier = document.querySelector('.lb-table-header .lb-col-tier');
    if (headerTier) {
      if (category === 'ascend') headerTier.textContent = 'TIER';
      else if (category === 'time_trial') headerTier.textContent = 'ACC';
      else headerTier.textContent = 'RANK';
    }

    if (els.lbDurationFilter) {
      els.lbDurationFilter.style.display = category === 'time_trial' ? '' : 'none';
    }

    if (!data || data.length === 0) {
      els.lbTableBody.innerHTML = '<div class="lb-empty">No players found</div>';
      return;
    }

    const isAscend = category === 'ascend';
    const isTimeTrial = category === 'time_trial';
    let html = '';
    for (let i = 0; i < data.length; i++) {
      const p = data[i];
      let tierDisplay, statValue;
      if (isAscend) {
        tierDisplay = 'Tier ' + (p.tier ?? 0);
        statValue = p.height != null ? p.height.toFixed(1) + 'm' : '—';
      } else if (isTimeTrial) {
        tierDisplay = Math.round(p.accuracy || 0) + '%';
        statValue = Math.round(p.wpm || 0);
      } else {
        const tier = getRankTier(p.rating || 1000);
        tierDisplay = tier.name;
        switch (category) {
          case 'best_wpm': statValue = Math.round(p.best_wpm || 0); break;
          case 'wins': statValue = p.wins || 0; break;
          case 'xp': statValue = xpToLevel(p.xp || 0); break;
          default: statValue = p.rating || 1000;
        }
      }

      const rankClass = i === 0 ? 'lb-rank-1' : i === 1 ? 'lb-rank-2' : i === 2 ? 'lb-rank-3' : '';
      let tierColor;
      if (isAscend) tierColor = 'var(--gold)';
      else if (isTimeTrial) tierColor = 'var(--accent)';
      else tierColor = getRankTier(p.rating || 1000).color;

      html += `<div class="lb-row ${rankClass}">
        <span class="lb-col-rank">${i + 1}</span>
        <span class="lb-col-name">${escapeHtml(p.username)}</span>
        <span class="lb-col-tier" style="color:${tierColor}">${tierDisplay}</span>
        <span class="lb-col-stat">${statValue}</span>
      </div>`;
    }
    els.lbTableBody.innerHTML = html;
  }

  return {
    screens, els, showScreen, showWelcomeStep,
    setHomeUser, renderSentence, renderOpponentSentence, updatePlayerStats,
    updateOpponent, updateDuelMeter, showCountdown, hideCountdown, flashError,
    flashSentenceRange, flashOpponentRange,
    setMatchHeader, showRoundResult, showMatchResult,
    focusInput, resetGameUI, showAttackNotification, showAttackSentNotification,
    showVsIntro, hideVsIntro, setSentenceHidden, showFinishTimer, hideFinishTimer,
    showProfile, showLeaderboard, showTimeTrialProfile, isPlaceholderEmail, getRankTier,
    xpToLevel, renderHeaderLevel, showXpGain, showLevelUp, getLevelBadge
  };
})();
