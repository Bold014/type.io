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
    ascendResult: document.getElementById('screen-ascend-result'),
    shop: document.getElementById('screen-shop'),
    towerdefenseLobby: document.getElementById('screen-towerdefense-lobby'),
    towerdefense: document.getElementById('screen-towerdefense'),
    towerdefenseResult: document.getElementById('screen-towerdefense-result'),
    zen: document.getElementById('screen-zen'),
    custom: document.getElementById('screen-custom'),
    race: document.getElementById('screen-race'),
    raceResult: document.getElementById('screen-race-result'),
    achievements: document.getElementById('screen-achievements'),
    analytics: document.getElementById('screen-analytics'),
    clan: document.getElementById('screen-clan'),
    replay: document.getElementById('screen-replay')
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
    homeBadgeIcon: document.getElementById('home-badge-icon'),
    homeBadge: document.getElementById('home-badge'),
    homeTitle: document.getElementById('home-title'),
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
    cardTowerDefense: document.getElementById('card-towerdefense'),
    rankedSub: document.getElementById('ranked-sub'),
    rankedLock: document.getElementById('ranked-lock'),

    globalChatMessages: document.getElementById('global-chat-messages'),
    globalChatInput: document.getElementById('global-chat-input'),
    globalChatSend: document.getElementById('global-chat-send'),
    globalChatInputArea: document.getElementById('global-chat-input-area'),
    globalChatLoginHint: document.getElementById('global-chat-login-hint'),

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
    profileHomeBadgeIcon: document.getElementById('profile-home-badge-icon'),
    profileHomeTitle: document.getElementById('profile-home-title'),
    profileRecord: document.getElementById('profile-record'),
    profileRankedGames: document.getElementById('profile-ranked-games'),
    profileTotalWins: document.getElementById('profile-total-wins'),
    profileTotalChars: document.getElementById('profile-total-chars'),
    profileLoginStreak: document.getElementById('profile-login-streak'),
    profileLongestStreak: document.getElementById('profile-longest-streak'),
    profileCoins: document.getElementById('profile-coins'),
    profileUserId: document.getElementById('profile-user-id'),
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
    btnAscendExit: document.getElementById('btn-ascend-exit'),

    homeCoinPill: document.getElementById('home-coin-pill'),
    homeCoinCount: document.getElementById('home-coin-count'),
    btnLandingShop: document.getElementById('btn-landing-shop'),
    homeChallenges: document.getElementById('home-challenges'),
    challengesList: document.getElementById('challenges-list'),
    weeklyChallengesList: document.getElementById('weekly-challenges-list'),

    btnShopBack: document.getElementById('btn-shop-back'),
    shopCoinCount: document.getElementById('shop-coin-count'),
    shopTabs: document.getElementById('shop-tabs'),
    shopGrid: document.getElementById('shop-grid'),

    coinGainDisplay: document.getElementById('coin-gain-display'),
    coinGainAmount: document.getElementById('coin-gain-amount'),
    ascendCoinGainDisplay: document.getElementById('ascend-coin-gain-display'),
    ascendCoinGainAmount: document.getElementById('ascend-coin-gain-amount'),
    ttCoinGainDisplay: document.getElementById('tt-coin-gain-display'),
    ttCoinGainAmount: document.getElementById('tt-coin-gain-amount'),
    tdCoinGainDisplay: document.getElementById('td-coin-gain-display'),
    tdCoinGainAmount: document.getElementById('td-coin-gain-amount'),
    raceCoinGainDisplay: document.getElementById('race-coin-gain-display'),
    raceCoinGainAmount: document.getElementById('race-coin-gain-amount')
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

  const PLACEMENT_GAMES = 5;

  function updateMoneyDisplay(coins) {
    const c = coins || 0;
    if (els.homeCoinPill) {
      els.homeCoinPill.style.display = c >= 0 ? '' : 'none';
      els.homeCoinCount.textContent = c.toLocaleString();
    }
    if (els.shopCoinCount) {
      els.shopCoinCount.textContent = c.toLocaleString();
    }
  }

  function updateCoinDisplay(coins) { updateMoneyDisplay(coins); }

  function setHomeUser(username, isLoggedIn, rating, xp, rankedGamesPlayed, coins, equipped) {
    els.homeUsername.textContent = username.toUpperCase();
    applyUsernameStyle(els.homeUsername, equipped);
    const badgeIcon = getEquippedBadge(equipped);
    const titleText = getEquippedTitle(equipped);
    if (els.homeBadgeIcon) {
      els.homeBadgeIcon.innerHTML = (badgeIcon && BADGE_SVGS[badgeIcon]) ? BADGE_SVGS[badgeIcon] : '';
      els.homeBadgeIcon.style.display = els.homeBadgeIcon.innerHTML ? '' : 'none';
    }
    if (els.homeTitle) {
      els.homeTitle.textContent = titleText || '';
      els.homeTitle.style.display = titleText ? '' : 'none';
    }
    if (isLoggedIn) {
      updateMoneyDisplay(coins || 0);
      if (els.btnLandingShop) els.btnLandingShop.style.display = '';
      const level = xpToLevel(xp || 0);
      const rgp = rankedGamesPlayed || 0;
      const placementsDone = rgp >= PLACEMENT_GAMES;

      if (placementsDone) {
        const tier = getRankTier(rating || 1000);
        els.homeBadge.textContent = `${tier.name.toUpperCase()} — ${rating || 1000} SR`;
        els.homeBadge.className = 'home-badge ranked';
        els.homeBadge.style.color = tier.color;
        els.homeBadge.style.background = tier.color + '1a';
        els.homeBadge.style.boxShadow = `0 0 12px ${tier.color}1a`;
      } else {
        els.homeBadge.textContent = rgp > 0 ? `UNRANKED — ${rgp}/${PLACEMENT_GAMES} placements` : 'UNRANKED';
        els.homeBadge.className = 'home-badge ranked';
        els.homeBadge.style.color = '#888';
        els.homeBadge.style.background = 'rgba(136,136,136,0.1)';
        els.homeBadge.style.boxShadow = 'none';
      }

      els.btnHomeAuth.style.display = 'none';
      const isSbox = window.APP_CONFIG && window.APP_CONFIG.platform === 'sbox';
      els.btnHomeLogout.style.display = isSbox ? 'none' : '';

      if (level < 5) {
        els.rankedSub.textContent = `Unlocks at Level 5 (you are Level ${level})`;
        els.rankedLock.style.display = '';
        els.cardRanked.classList.add('disabled');
      } else {
        els.rankedSub.textContent = 'Climb the leaderboard';
        els.rankedLock.style.display = 'none';
        els.cardRanked.classList.remove('disabled');
      }

      renderHeaderLevel(xp || 0);
    } else {
      els.homeBadge.textContent = 'GUEST';
      els.homeBadge.className = 'home-badge';
      els.homeBadge.style.color = '';
      els.homeBadge.style.background = '';
      els.homeBadge.style.boxShadow = '';
      if (els.homeBadgeIcon) { els.homeBadgeIcon.innerHTML = ''; els.homeBadgeIcon.style.display = 'none'; }
      if (els.homeTitle) { els.homeTitle.textContent = ''; els.homeTitle.style.display = 'none'; }
      els.btnHomeAuth.style.display = '';
      els.btnHomeLogout.style.display = 'none';
      els.rankedSub.textContent = 'Log in to unlock ranked play';
      els.rankedLock.style.display = '';
      els.cardRanked.classList.add('disabled');
      hideHeaderLevel();
      if (els.homeCoinPill) els.homeCoinPill.style.display = 'none';
      if (els.btnLandingShop) els.btnLandingShop.style.display = 'none';
    }
  }

  function isInInjectedRange(index, ranges) {
    if (!ranges || !ranges.length) return false;
    for (const [start, end] of ranges) {
      if (index >= start && index < end) return true;
    }
    return false;
  }

  function renderSentence(sentence, charStates, injectedRanges, typed) {
    let html = '';
    for (let i = 0; i < sentence.length; i++) {
      let cls = charStates[i] || 'pending';
      if (isInInjectedRange(i, injectedRanges) && (cls === 'pending' || cls === 'current')) {
        cls += ' injected';
      }
      const isSpace = sentence[i] === ' ';
      const isErrorOnSpace = isSpace && cls === 'error' && typed && typed[i] && typed[i] !== ' ';
      const char = isErrorOnSpace ? escapeHtml(typed[i]) : (isSpace ? ' ' : escapeHtml(sentence[i]));
      html += `<span class="char ${cls}${isSpace && !isErrorOnSpace ? ' space' : ''}">${char}</span>`;
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

  function setGameScreenNameColors(myEquipped, opponentEquipped, opponentName) {
    const myColor = getEquippedColor(myEquipped);
    const oppColor = getEquippedColor(opponentEquipped);
    const myBadge = getEquippedBadge(myEquipped);
    const myTitle = getEquippedTitle(myEquipped);
    const oppBadge = getEquippedBadge(opponentEquipped);
    const oppTitle = getEquippedTitle(opponentEquipped);
    const youEl = document.querySelector('.panel-name-you');
    if (youEl) {
      youEl.style.color = myColor || '';
      youEl.innerHTML = 'YOU' +
        (myBadge && BADGE_SVGS[myBadge] ? `<span class="panel-badge-icon">${BADGE_SVGS[myBadge]}</span>` : '') +
        (myTitle ? `<span class="panel-title">${escapeHtml(myTitle)}</span>` : '');
    }
    if (els.opponentNameBar) {
      els.opponentNameBar.style.color = oppColor || '';
      els.opponentNameBar.innerHTML = (opponentName ? escapeHtml(opponentName) : '') +
        (oppBadge && BADGE_SVGS[oppBadge] ? `<span class="panel-badge-icon">${BADGE_SVGS[oppBadge]}</span>` : '') +
        (oppTitle ? `<span class="panel-title">${escapeHtml(oppTitle)}</span>` : '');
    }
    if (els.opponentNamePanel) {
      els.opponentNamePanel.style.color = oppColor || '';
      els.opponentNamePanel.innerHTML = (opponentName ? escapeHtml(opponentName.toUpperCase()) : '') +
        (oppBadge && BADGE_SVGS[oppBadge] ? `<span class="panel-badge-icon">${BADGE_SVGS[oppBadge]}</span>` : '') +
        (oppTitle ? `<span class="panel-title">${escapeHtml(oppTitle)}</span>` : '');
    }
  }

  function showRoundResult(data, myUsername, myEquipped, opponentEquipped) {
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

    const myColor = getEquippedColor(myEquipped);
    const oppColor = getEquippedColor(opponentEquipped);
    const myBadge = getEquippedBadge(myEquipped);
    const myTitle = getEquippedTitle(myEquipped);
    const oppBadge = getEquippedBadge(opponentEquipped);
    const oppTitle = getEquippedTitle(opponentEquipped);
    const youLabel = document.querySelector('.score-card.you h3');
    if (youLabel) {
      youLabel.style.color = myColor || '';
      youLabel.innerHTML = 'You' + (myBadge && BADGE_SVGS[myBadge] ? `<span class="panel-badge-icon">${BADGE_SVGS[myBadge]}</span>` : '') + (myTitle ? `<span class="panel-title">${escapeHtml(myTitle)}</span>` : '');
    }
    if (els.resultOppName) {
      els.resultOppName.style.color = oppColor || '';
      els.resultOppName.innerHTML = escapeHtml(data.opponent.username) + (oppBadge && BADGE_SVGS[oppBadge] ? `<span class="panel-badge-icon">${BADGE_SVGS[oppBadge]}</span>` : '') + (oppTitle ? `<span class="panel-title">${escapeHtml(oppTitle)}</span>` : '');
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
      if (data.ratingChange.isPlacement) {
        const played = data.ratingChange.rankedGamesPlayed || 0;
        if (data.ratingChange.placementGamesLeft === 0) {
          const tier = getRankTier(data.ratingChange.newRating);
          els.ratingChange.textContent = `Placements complete! ${tier.name} — ${data.ratingChange.newRating} SR`;
          els.ratingChange.style.color = tier.color;
        } else {
          els.ratingChange.textContent = `Placement ${played}/${PLACEMENT_GAMES} complete`;
          els.ratingChange.style.color = 'var(--text-dim)';
        }
      } else {
        const delta = data.ratingChange.ratingDelta;
        const sign = delta >= 0 ? '+' : '';
        els.ratingChange.textContent = `Rating: ${data.ratingChange.newRating} (${sign}${delta})`;
        els.ratingChange.style.color = delta >= 0 ? 'var(--green)' : 'var(--red)';
      }
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

  function showVsIntro(playerName, opponentName, myEquipped, opponentEquipped) {
    els.vsIntroOverlay.classList.remove('fade-out');
    const myBadge = getEquippedBadge(myEquipped);
    const myTitle = getEquippedTitle(myEquipped);
    const oppBadge = getEquippedBadge(opponentEquipped);
    const oppTitle = getEquippedTitle(opponentEquipped);
    els.vsIntroLeft.innerHTML = `<span class="vs-name">${escapeHtml(playerName)}</span>` +
      (myBadge && BADGE_SVGS[myBadge] ? `<span class="vs-badge-icon">${BADGE_SVGS[myBadge]}</span>` : '') +
      (myTitle ? `<span class="vs-title">${escapeHtml(myTitle)}</span>` : '');
    els.vsIntroRight.innerHTML = `<span class="vs-name">${escapeHtml(opponentName)}</span>` +
      (oppBadge && BADGE_SVGS[oppBadge] ? `<span class="vs-badge-icon">${BADGE_SVGS[oppBadge]}</span>` : '') +
      (oppTitle ? `<span class="vs-title">${escapeHtml(oppTitle)}</span>` : '');
    const myNameEl = els.vsIntroLeft.querySelector('.vs-name');
    const oppNameEl = els.vsIntroRight.querySelector('.vs-name');
    if (myNameEl) applyUsernameStyle(myNameEl, myEquipped);
    if (oppNameEl) applyUsernameStyle(oppNameEl, opponentEquipped);
    els.vsIntroLeft.style.color = '';
    els.vsIntroRight.style.color = '';

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
    const rgp = profile.ranked_games_played || 0;
    const placementsDone = rgp >= PLACEMENT_GAMES;
    const tier = getRankTier(profile.rating || 1000);

    els.profileUsername.textContent = (profile.username || '').toUpperCase();
    els.profileHomeUsername.textContent = (profile.username || '').toUpperCase();
    applyUsernameStyle(els.profileUsername, profile.equipped);
    applyUsernameStyle(els.profileHomeUsername, profile.equipped);
    const profileBadgeIcon = getEquippedBadge(profile.equipped);
    const profileTitleText = getEquippedTitle(profile.equipped);
    if (els.profileHomeBadgeIcon) {
      els.profileHomeBadgeIcon.innerHTML = (profileBadgeIcon && BADGE_SVGS[profileBadgeIcon]) ? BADGE_SVGS[profileBadgeIcon] : '';
      els.profileHomeBadgeIcon.style.display = els.profileHomeBadgeIcon.innerHTML ? '' : 'none';
    }
    if (els.profileHomeTitle) {
      els.profileHomeTitle.textContent = profileTitleText || '';
      els.profileHomeTitle.style.display = profileTitleText ? '' : 'none';
    }
    if (placementsDone) {
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
    } else {
      els.profileHomeBadge.textContent = rgp > 0 ? `UNRANKED — ${rgp}/${PLACEMENT_GAMES} placements` : 'UNRANKED';
      els.profileHomeBadge.className = 'home-badge ranked';
      els.profileHomeBadge.style.color = '#888';
      els.profileHomeBadge.style.background = 'rgba(136,136,136,0.1)';
      els.profileHomeBadge.style.boxShadow = 'none';

      els.profileRankBadge.textContent = 'UNRANKED';
      els.profileRankBadge.style.color = '#888';
      els.profileRankBadge.style.borderColor = '#888';
      els.profileRankBadge.style.textShadow = 'none';
      els.profileSr.textContent = rgp > 0 ? `${rgp}/${PLACEMENT_GAMES}` : '—';
    }

    const xp = profile.xp || 0;
    const level = xpToLevel(xp);
    const currentLevelXp = xpForLevel(level);
    const nextLevelXp = xpForLevel(level + 1);
    const levelProgress = nextLevelXp > currentLevelXp
      ? (xp - currentLevelXp) / (nextLevelXp - currentLevelXp)
      : 0;
    const progressPct = Math.max(0, Math.min(100, levelProgress * 100));
    const badge = getLevelBadge(level);

    els.profileXpBadgeIcon.innerHTML = buildBadgeSvg(badge.shape, badge.shapeColor, 24);
    els.profileXpLevelNum.textContent = level;
    els.profileXpLevelNum.style.color = badge.tagColor;
    els.profileXpPct.textContent = `${Math.round(progressPct)}%`;
    els.profileXpBarFill.style.width = `${progressPct}%`;
    els.profileXpTotal.textContent = xp.toLocaleString();

    const wins = profile.wins || 0;
    const losses = profile.losses || 0;
    const total = wins + losses;
    const winPct = total > 0 ? ((wins / total) * 100).toFixed(1) : 0;

    els.profileBestWpm.textContent = Math.round(profile.best_wpm || 0);
    els.profileWins.textContent = wins;
    els.profileLosses.textContent = losses;
    els.profileWinRate.textContent = total > 0 ? Math.round(winPct) + '%' : '—';
    els.profileAvgWpm.textContent = Math.round(profile.avg_wpm || 0);
    els.profileGamesPlayed.textContent = profile.games_played || 0;

    if (els.profileRecord) {
      els.profileRecord.textContent = total > 0
        ? `${wins}/${total} (${winPct}%)`
        : 'No games played';
    }
    if (els.profileRankedGames) {
      els.profileRankedGames.textContent = rgp;
    }

    if (els.profileTotalWins) els.profileTotalWins.textContent = wins;
    if (els.profileTotalChars) {
      const chars = profile.total_chars_typed || 0;
      els.profileTotalChars.textContent = chars >= 1000000
        ? (chars / 1000000).toFixed(1) + 'M'
        : chars >= 1000 ? (chars / 1000).toFixed(1) + 'K' : chars;
    }
    if (els.profileLoginStreak) els.profileLoginStreak.textContent = (profile.login_streak || 0) + ' days';
    if (els.profileLongestStreak) els.profileLongestStreak.textContent = (profile.longest_streak || 0) + ' days';
    if (els.profileCoins) els.profileCoins.textContent = '$' + (profile.coins || 0).toLocaleString();
    if (els.profileUserId) els.profileUserId.textContent = 'ID: ' + (profile.id || '').substring(0, 12) + '...';

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
      coins: 'MONEY',
      ascend: 'HEIGHT',
      time_trial: 'WPM',
      tower_defense: 'SCORE'
    };

    const headerStat = document.querySelector('.lb-col-stat');
    if (headerStat) headerStat.textContent = categoryLabels[category] || 'VALUE';

    const headerTier = document.querySelector('.lb-table-header .lb-col-tier');
    if (headerTier) {
      if (category === 'ascend') headerTier.textContent = 'TIER';
      else if (category === 'time_trial') headerTier.textContent = 'ACC';
      else if (category === 'tower_defense') headerTier.textContent = 'WAVE';
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
    const isTD = category === 'tower_defense';
    let html = '';
    for (let i = 0; i < data.length; i++) {
      const p = data[i];
      let tierDisplay, statValue;
      if (isTD) {
        tierDisplay = 'Wave ' + (p.waves_survived ?? 0);
        statValue = p.score ?? 0;
      } else if (isAscend) {
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
          case 'coins': statValue = '$' + (p.coins || 0).toLocaleString(); break;
          default: statValue = p.rating || 1000;
        }
      }

      const rankClass = i === 0 ? 'lb-rank-1' : i === 1 ? 'lb-rank-2' : i === 2 ? 'lb-rank-3' : '';
      let tierColor;
      if (isTD) tierColor = 'var(--red)';
      else if (isAscend) tierColor = 'var(--gold)';
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

  function renderHomeMiniLeaderboard(data, category) {
    const body = document.getElementById('mini-lb-body');
    if (!body) return;
    const cat = category || 'rating';

    if (!data || data.length === 0) {
      body.innerHTML = '<div class="mini-lb-empty">No players yet</div>';
      return;
    }

    let html = '';
    for (let i = 0; i < data.length; i++) {
      const p = data[i];
      const tier = getRankTier(p.rating || 1000);
      const rowClass = i < 3 ? ` mini-lb-row-${i + 1}` : '';

      let statValue, statLabel;
      switch (cat) {
        case 'coins':
          statValue = '$' + (p.coins || 0).toLocaleString();
          statLabel = '';
          break;
        case 'best_wpm':
          statValue = Math.round(p.best_wpm || 0);
          statLabel = 'WPM';
          break;
        case 'wins':
          statValue = p.wins || 0;
          statLabel = 'W';
          break;
        case 'xp':
          statValue = 'LV ' + xpToLevel(p.xp || 0);
          statLabel = '';
          break;
        default:
          statValue = p.rating || 1000;
          statLabel = 'SR';
      }

      html += `<div class="mini-lb-row${rowClass}">
        <span class="mini-lb-rank">${i + 1}</span>
        <div class="mini-lb-info">
          <span class="mini-lb-name">${escapeHtml(p.username)}</span>
          <span class="mini-lb-tier" style="color:${tier.color}">${tier.name}</span>
        </div>
        <span class="mini-lb-sr">${statValue}<span class="mini-lb-unit">${statLabel ? ' ' + statLabel : ''}</span></span>
      </div>`;
    }
    body.innerHTML = html;
  }

  // --- SHOP RENDERING ---

  const CATEGORY_LABELS = {
    username_color: 'COLORS',
    username_gradient: 'GRADIENTS',
    name_effect: 'EFFECTS',
    cursor_skin: 'CURSORS',
    badge: 'BADGES',
    title: 'TITLES',
    chat_emote: 'EMOTES',
    upgrades: 'UPGRADES'
  };

  const BADGE_SVGS = {
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>',
    lightning: '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10"/></svg>',
    crown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 20h20v2H2zm1-7l4-7 5 4 4.5-6L21 13v5H3z"/></svg>',
    flame: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 23c-3.6 0-7-2.5-7-7 0-3.2 2-5.5 3.5-7.5.4-.5 1.2-.3 1.3.3.3 1 .8 1.8 1.5 2.5.1-.8.5-1.8 1.2-2.8 1.2-1.7 2-3.5 2-5.5 0-.5.5-.8 1-.5C18.5 5 20 8.5 20 11.5c0 6.5-4.5 11.5-8 11.5z"/></svg>',
    skull: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12c0 3.5 1.8 6.5 4.5 8.3V22h3v-1h5v1h3v-1.7C20.2 18.5 22 15.5 22 12c0-5.5-4.5-10-10-10zM8.5 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm7 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
    diamond: '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 22,9 12,22 2,9"/></svg>'
  };

  function renderShopItemPreview(item) {
    const d = item.data || {};
    switch (item.category) {
      case 'username_color':
        return `<span class="shop-preview-color" style="background:${d.hex || '#fff'}"></span>`;
      case 'username_gradient':
        return `<span class="shop-preview-gradient" style="background:linear-gradient(90deg,${d.from || '#fff'},${d.to || '#fff'})">${escapeHtml(item.name)}</span>`;
      case 'name_effect':
        return `<span class="shop-preview-effect name-effect-${d.effect || 'glow'}" style="color:#fff">${escapeHtml(item.name)}</span>`;
      case 'cursor_skin':
        return `<span class="shop-preview-cursor shop-cursor-${d.style || 'block'}"></span>`;
      case 'badge': {
        const icon = d.icon || '';
        const animated = d.animated ? (icon === 'diamond' ? ' badge-diamond' : ' badge-animated') : '';
        return `<span class="shop-preview-badge${animated}">${BADGE_SVGS[icon] || ''}</span>`;
      }
      case 'title':
        return `<span class="shop-preview-title">${escapeHtml(d.text || item.name)}</span>`;
      case 'chat_emote':
        return `<span class="shop-preview-emote">${escapeHtml(d.text || item.name)}</span>`;
      default:
        return '';
    }
  }

  function renderShop(items, inventory, equipped, coins, category, upgradeData) {
    if (!els.shopGrid) return;
    updateMoneyDisplay(coins);

    if (category === 'upgrades') {
      renderUpgradePanel(upgradeData || {});
      return;
    }

    const ownedSet = new Set((inventory || []).map(i => i.item_id));
    const equippedMap = {};
    (equipped || []).forEach(e => { equippedMap[e.category] = e.item_id; });

    const filtered = (items || []).filter(i => i.category === category);

    if (filtered.length === 0) {
      els.shopGrid.innerHTML = '<div class="shop-empty">No items in this category</div>';
      return;
    }

    let html = '';
    for (const item of filtered) {
      const owned = ownedSet.has(item.id);
      const isEquipped = equippedMap[item.category] === item.id;
      const levelLocked = item.level_required > 0;

      let stateClass = '';
      let btnText = `<span class="shop-card-price">$${item.price.toLocaleString()}</span>`;
      let btnClass = 'shop-card-btn shop-btn-buy';

      if (isEquipped) {
        stateClass = ' shop-card-equipped';
        btnText = 'EQUIPPED';
        btnClass = 'shop-card-btn shop-btn-equipped';
      } else if (owned) {
        stateClass = ' shop-card-owned';
        btnText = 'EQUIP';
        btnClass = 'shop-card-btn shop-btn-equip';
      }

      html += `<div class="shop-card${stateClass}" data-item-id="${item.id}" data-item-cat="${item.category}">
        <div class="shop-card-preview">${renderShopItemPreview(item)}</div>
        <div class="shop-card-name">${escapeHtml(item.name)}</div>
        ${levelLocked && !owned ? `<div class="shop-card-lvl">LV. ${item.level_required}</div>` : ''}
        <button class="${btnClass}" data-action="${isEquipped ? 'unequip' : owned ? 'equip' : 'buy'}">${btnText}</button>
      </div>`;
    }
    els.shopGrid.innerHTML = html;
  }

  const CHAR_VALUE_UPGRADES = [
    { level: 0, value: 1,   cost: 0 },
    { level: 1, value: 2,   cost: 500 },
    { level: 2, value: 4,   cost: 2000 },
    { level: 3, value: 7,   cost: 8000 },
    { level: 4, value: 12,  cost: 30000 },
    { level: 5, value: 20,  cost: 100000 },
    { level: 6, value: 35,  cost: 350000 },
    { level: 7, value: 60,  cost: 1000000 },
    { level: 8, value: 100, cost: 3000000 },
    { level: 9, value: 175, cost: 10000000 },
  ];

  function renderUpgradePanel(data) {
    if (!els.shopGrid) return;
    const level = data.charValueLevel || 0;
    const current = CHAR_VALUE_UPGRADES[level] || CHAR_VALUE_UPGRADES[0];
    const next = CHAR_VALUE_UPGRADES[level + 1] || null;
    const totalChars = data.totalCharsTyped || 0;
    const balance = data.coins || 0;
    const isMax = !next;
    const canAfford = next && balance >= next.cost;

    let html = `<div class="upgrade-panel">
      <div class="upgrade-level-display">
        <div class="upgrade-level-label">Character Value Level</div>
        <div class="upgrade-level-num">${level}</div>
      </div>
      <div class="upgrade-char-value">$${current.value} per character</div>
      <div class="upgrade-stat-row">
        <span>Total characters typed</span>
        <span class="upgrade-stat-value">${totalChars.toLocaleString()}</span>
      </div>
      <div class="upgrade-stat-row">
        <span>Total earned (lifetime)</span>
        <span class="upgrade-stat-value">$${(totalChars * current.value).toLocaleString()}</span>
      </div>`;

    if (!isMax) {
      const pct = Math.min(100, Math.round((balance / next.cost) * 100));
      html += `
      <div class="upgrade-stat-row">
        <span>Next: $${(CHAR_VALUE_UPGRADES[level + 1].value)} / char</span>
        <span class="upgrade-stat-value">$${next.cost.toLocaleString()}</span>
      </div>
      <div class="upgrade-progress"><div class="upgrade-progress-fill" style="width:${pct}%"></div></div>
      <button class="upgrade-btn" id="btn-upgrade-char-value" ${canAfford ? '' : 'disabled'}>
        UPGRADE — $${next.cost.toLocaleString()}
      </button>`;
    } else {
      html += `<button class="upgrade-btn upgrade-btn-max" disabled>MAX LEVEL</button>`;
    }

    html += `</div>`;
    els.shopGrid.innerHTML = html;
  }

  function updateHomeUpgradeWidget(data) {
    const widget = document.getElementById('home-upgrade-widget');
    if (!widget) return;
    const level = data.charValueLevel || 0;
    const current = CHAR_VALUE_UPGRADES[level] || CHAR_VALUE_UPGRADES[0];
    const next = CHAR_VALUE_UPGRADES[level + 1] || null;
    const totalChars = data.totalCharsTyped || 0;
    const balance = data.coins || 0;
    const isMax = !next;

    widget.style.display = '';

    const valEl = document.getElementById('home-upgrade-value');
    const lvlEl = document.getElementById('home-upgrade-level');
    const charsEl = document.getElementById('home-upgrade-total-chars');
    const costEl = document.getElementById('home-upgrade-cost');
    const btn = document.getElementById('btn-home-upgrade');
    const progressFill = document.getElementById('home-upgrade-progress-fill');

    if (valEl) valEl.textContent = '$' + current.value;
    if (lvlEl) lvlEl.textContent = level;
    if (charsEl) charsEl.textContent = totalChars.toLocaleString();

    if (isMax) {
      if (btn) {
        btn.textContent = 'MAX LEVEL';
        btn.disabled = true;
        btn.classList.add('maxed');
      }
      if (progressFill) progressFill.style.width = '100%';
    } else {
      if (costEl) costEl.textContent = next.cost.toLocaleString();
      if (btn) {
        btn.innerHTML = 'UPGRADE — $<span id="home-upgrade-cost">' + next.cost.toLocaleString() + '</span>';
        btn.disabled = balance < next.cost;
        btn.classList.remove('maxed');
      }
      if (progressFill) {
        const pct = Math.min(100, Math.round((balance / next.cost) * 100));
        progressFill.style.width = pct + '%';
      }
    }
  }

  // --- CHALLENGE RENDERING ---

  const CHALLENGE_LABELS = {
    win_duels: n => `Win ${n} duel${n > 1 ? 's' : ''}`,
    play_matches: n => `Play ${n} match${n > 1 ? 'es' : ''}`,
    type_chars: n => `Type ${n.toLocaleString()} characters`,
    complete_climbs: n => `Complete ${n} Climb run${n > 1 ? 's' : ''}`,
    complete_timetrials: n => `Complete ${n} Time Trial${n > 1 ? 's' : ''}`,
    complete_towerdefense: n => `Complete ${n} Defense run${n > 1 ? 's' : ''}`
  };

  function buildChallengeCards(challenges) {
    let html = '';
    for (const c of challenges) {
      const labelFn = CHALLENGE_LABELS[c.challenge_type];
      const desc = labelFn ? labelFn(c.target) : c.challenge_type;
      const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
      const done = c.completed;

      html += `<div class="challenge-card${done ? ' challenge-done' : ''}">
        <div class="challenge-info">
          <span class="challenge-desc">${escapeHtml(desc)}</span>
          <span class="challenge-reward">${done ? 'DONE' : '$' + c.coin_reward.toLocaleString()}</span>
        </div>
        <div class="challenge-bar-row">
          <div class="challenge-progress-bar">
            <div class="challenge-progress-fill" style="width:${pct}%"></div>
          </div>
          <span class="challenge-progress-text">${c.progress} / ${c.target}</span>
        </div>
      </div>`;
    }
    return html;
  }

  function renderChallenges(daily, weekly) {
    if (!els.challengesList || !els.homeChallenges) return;
    const hasDaily = daily && daily.length > 0;
    const hasWeekly = weekly && weekly.length > 0;

    if (!hasDaily && !hasWeekly) {
      els.homeChallenges.style.display = 'none';
      return;
    }

    els.homeChallenges.style.display = '';
    els.challengesList.innerHTML = hasDaily ? buildChallengeCards(daily) : '';
    if (els.weeklyChallengesList) {
      els.weeklyChallengesList.innerHTML = hasWeekly ? buildChallengeCards(weekly) : '';
    }
  }

  // --- COIN GAIN DISPLAY ---

  function showMoneyGain(moneyGained, target, charsTyped, charValue) {
    const displayEl = target === 'ascend' ? els.ascendCoinGainDisplay
      : target === 'tt' ? els.ttCoinGainDisplay
      : target === 'td' ? els.tdCoinGainDisplay
      : target === 'race' ? els.raceCoinGainDisplay
      : els.coinGainDisplay;
    const amountEl = target === 'ascend' ? els.ascendCoinGainAmount
      : target === 'tt' ? els.ttCoinGainAmount
      : target === 'td' ? els.tdCoinGainAmount
      : target === 'race' ? els.raceCoinGainAmount
      : els.coinGainAmount;

    const breakdownElId = target === 'ascend' ? 'ascend-coin-gain-breakdown'
      : target === 'tt' ? 'tt-coin-gain-breakdown'
      : target === 'td' ? 'td-coin-gain-breakdown'
      : target === 'race' ? 'race-coin-gain-breakdown'
      : 'coin-gain-breakdown';
    const breakdownEl = document.getElementById(breakdownElId);

    if (!displayEl || !amountEl) return;

    if (!moneyGained || moneyGained <= 0) {
      displayEl.style.display = 'none';
      return;
    }

    amountEl.textContent = `+$${moneyGained.toLocaleString()}`;
    if (breakdownEl && charsTyped && charValue) {
      breakdownEl.textContent = `${charsTyped.toLocaleString()} chars × $${charValue}`;
    } else if (breakdownEl) {
      breakdownEl.textContent = '';
    }
    displayEl.style.display = '';
  }

  function showCoinGain(coinsGained, target, charsTyped, charValue) {
    showMoneyGain(coinsGained, target, charsTyped, charValue);
  }

  function getEquippedColor(equipped) {
    if (!equipped || !Array.isArray(equipped)) return null;
    const e = equipped.find(x => x.category === 'username_color');
    return (e && e.data && e.data.hex) ? e.data.hex : null;
  }
  function getEquippedCursorSkin(equipped) {
    if (!equipped || !Array.isArray(equipped)) return 'block';
    const e = equipped.find(x => x.category === 'cursor_skin');
    return (e && e.data && e.data.style) ? e.data.style : 'block';
  }
  function getEquippedBadge(equipped) {
    if (!equipped || !Array.isArray(equipped)) return null;
    const e = equipped.find(x => x.category === 'badge');
    return (e && e.data && e.data.icon) ? e.data.icon : null;
  }
  function getEquippedBadgeAnimated(equipped) {
    if (!equipped || !Array.isArray(equipped)) return false;
    const e = equipped.find(x => x.category === 'badge');
    return (e && e.data && e.data.animated) ? true : false;
  }
  function getEquippedTitle(equipped) {
    if (!equipped || !Array.isArray(equipped)) return null;
    const e = equipped.find(x => x.category === 'title');
    return (e && e.data && e.data.text) ? e.data.text : null;
  }
  function getEquippedEmotes(equipped) {
    if (!equipped || !Array.isArray(equipped)) return [];
    const e = equipped.find(x => x.category === 'chat_emote');
    return (e && e.data && e.data.text) ? [e.data.text] : [];
  }
  function getEquippedNameEffect(equipped) {
    if (!equipped || !Array.isArray(equipped)) return null;
    const e = equipped.find(x => x.category === 'name_effect');
    return (e && e.data && e.data.effect) ? e.data.effect : null;
  }
  function getEquippedGradient(equipped) {
    if (!equipped || !Array.isArray(equipped)) return null;
    const e = equipped.find(x => x.category === 'username_gradient');
    return (e && e.data) ? { from: e.data.from, to: e.data.to } : null;
  }

  function applyUsernameStyle(el, equipped) {
    if (!el) return;
    el.className = el.className.replace(/\bname-effect-\w+\b/g, '').replace(/\bname-gradient\b/g, '').trim();
    el.style.color = '';
    el.style.background = '';
    el.style.backgroundClip = '';
    el.style.webkitBackgroundClip = '';
    el.style.textShadow = '';

    const gradient = getEquippedGradient(equipped);
    if (gradient) {
      el.style.background = `linear-gradient(90deg, ${gradient.from}, ${gradient.to})`;
      el.style.backgroundClip = 'text';
      el.style.webkitBackgroundClip = 'text';
      el.style.color = 'transparent';
      el.classList.add('name-gradient');
    } else {
      const color = getEquippedColor(equipped);
      if (color) el.style.color = color;
    }

    const effect = getEquippedNameEffect(equipped);
    if (effect) {
      el.classList.add('name-effect-' + effect);
    }
  }

  function applyUsernameStyleInline(equipped) {
    const gradient = getEquippedGradient(equipped);
    if (gradient) {
      return `background:linear-gradient(90deg,${gradient.from},${gradient.to});-webkit-background-clip:text;background-clip:text;color:transparent`;
    }
    const color = getEquippedColor(equipped);
    return color ? `color:${color}` : '';
  }

  function renderAchievements(allAchievements, userAchievements) {
    const grid = document.getElementById('achievements-grid');
    if (!grid) return;
    const unlockedSet = new Set((userAchievements || []).map(a => a.achievement_id));
    const points = unlockedSet.size * 10;
    const pointsPill = document.getElementById('achievement-points-pill');
    if (pointsPill) pointsPill.textContent = points + ' pts';

    let html = '';
    for (const a of allAchievements) {
      const unlocked = unlockedSet.has(a.id);
      html += `<div class="achievement-card${unlocked ? ' achievement-unlocked' : ''}">
        <div class="achievement-icon">${unlocked ? '&#9733;' : '&#9734;'}</div>
        <div class="achievement-info">
          <div class="achievement-name">${escapeHtml(a.name)}</div>
          <div class="achievement-desc">${escapeHtml(a.desc)}</div>
        </div>
        <div class="achievement-category">${escapeHtml(a.category)}</div>
      </div>`;
    }
    grid.innerHTML = html;
  }

  function showAchievementToast(name) {
    const toast = document.getElementById('achievement-toast');
    const nameEl = document.getElementById('achievement-toast-name');
    if (!toast || !nameEl) return;
    nameEl.textContent = name;
    toast.style.display = 'flex';
    setTimeout(() => { toast.style.display = 'none'; }, 3500);
  }

  function showEarningsToast(coinsGained, charsTyped, charValue) {
    const toast = document.getElementById('earnings-toast');
    const amountEl = document.getElementById('earnings-toast-amount');
    const breakdownEl = document.getElementById('earnings-toast-breakdown');
    if (!toast || !amountEl || !coinsGained || coinsGained <= 0) return;
    amountEl.textContent = `+$${coinsGained.toLocaleString()}`;
    if (breakdownEl && charsTyped && charValue) {
      breakdownEl.textContent = `${charsTyped.toLocaleString()} chars \u00d7 $${charValue}`;
    } else if (breakdownEl) {
      breakdownEl.textContent = '';
    }
    toast.style.display = 'flex';
    clearTimeout(showEarningsToast._tid);
    showEarningsToast._tid = setTimeout(() => { toast.style.display = 'none'; }, 3500);
  }

  function renderFriendsList(friends, requests) {
    const listEl = document.getElementById('friends-list');
    const reqEl = document.getElementById('friends-requests');
    if (!listEl) return;

    if (requests && requests.length > 0 && reqEl) {
      let rhtml = '<div class="friends-section-title">REQUESTS</div>';
      for (const r of requests) {
        rhtml += `<div class="friend-request-row">
          <span class="friend-name">${escapeHtml(r.username)}</span>
          <button class="btn btn-small friend-accept-btn" data-friend-id="${r.id}">ACCEPT</button>
          <button class="btn btn-small friend-decline-btn" data-friend-id="${r.id}">X</button>
        </div>`;
      }
      reqEl.innerHTML = rhtml;
      reqEl.style.display = '';
    } else if (reqEl) {
      reqEl.innerHTML = '';
      reqEl.style.display = 'none';
    }

    if (!friends || friends.length === 0) {
      listEl.innerHTML = '<div class="friends-empty">No friends yet</div>';
      return;
    }
    let html = '';
    for (const f of friends) {
      const onlineCls = f.online ? ' friend-online' : '';
      html += `<div class="friend-row${onlineCls}">
        <span class="friend-status-dot${onlineCls}"></span>
        <span class="friend-name">${escapeHtml(f.username)}</span>
        <button class="btn btn-small friend-remove-btn" data-friend-id="${f.id}">X</button>
      </div>`;
    }
    listEl.innerHTML = html;
  }

  function renderAnalytics(data) {
    const summary = document.getElementById('analytics-summary');
    const sessionStats = document.getElementById('analytics-session-stats');
    if (!summary || !data) return;

    summary.innerHTML = `<div class="analytics-stat-row">
      <div class="profile-stat-card"><span class="profile-stat-card-value">${data.avgWpm || 0}</span><span class="profile-stat-card-label">Avg WPM (30d)</span></div>
      <div class="profile-stat-card"><span class="profile-stat-card-value">${data.bestWpm || 0}</span><span class="profile-stat-card-label">Best WPM (30d)</span></div>
      <div class="profile-stat-card"><span class="profile-stat-card-value">${data.totalGames || 0}</span><span class="profile-stat-card-label">Games (30d)</span></div>
      <div class="profile-stat-card"><span class="profile-stat-card-value">${data.avgAccuracy || 0}%</span><span class="profile-stat-card-label">Avg Accuracy</span></div>
    </div>`;

    if (sessionStats) {
      sessionStats.innerHTML = `<div class="analytics-stat-row">
        <div class="profile-stat-card"><span class="profile-stat-card-value">${data.todayGames || 0}</span><span class="profile-stat-card-label">Games Today</span></div>
        <div class="profile-stat-card"><span class="profile-stat-card-value">${data.todayAvgWpm || 0}</span><span class="profile-stat-card-label">Today Avg WPM</span></div>
        <div class="profile-stat-card"><span class="profile-stat-card-value">${data.weekAvgWpm || 0}</span><span class="profile-stat-card-label">Week Avg WPM</span></div>
      </div>`;
    }

    renderWpmChart(data.wpmHistory || []);
  }

  function renderWpmChart(history) {
    const canvas = document.getElementById('analytics-wpm-chart');
    if (!canvas || !history.length) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const padding = 40;

    ctx.clearRect(0, 0, w, h);

    const values = history.map(p => p.wpm);
    const maxVal = Math.max(...values, 1);
    const minVal = Math.min(...values, 0);
    const range = maxVal - minVal || 1;

    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, h - padding);
    ctx.lineTo(w - padding, h - padding);
    ctx.stroke();

    ctx.fillStyle = '#888';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = Math.round(minVal + (range * i / 4));
      const y = h - padding - ((i / 4) * (h - padding * 2));
      ctx.fillText(val, padding - 5, y + 4);
    }

    const step = (w - padding * 2) / Math.max(1, values.length - 1);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = padding + i * step;
      const y = h - padding - ((v - minVal) / range * (h - padding * 2));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#3b82f6';
    values.forEach((v, i) => {
      const x = padding + i * step;
      const y = h - padding - ((v - minVal) / range * (h - padding * 2));
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function renderRaceResults(results, myUsername) {
    const list = document.getElementById('race-results-list');
    if (!list) return;
    let html = '';
    for (const r of results) {
      const isMe = r.username === myUsername;
      const placeText = r.finished ? `#${r.place}` : 'DNF';
      html += `<div class="race-result-row${isMe ? ' race-result-me' : ''}">
        <span class="race-result-place">${placeText}</span>
        <span class="race-result-name">${escapeHtml(r.username)}</span>
        <span class="race-result-wpm">${r.wpm} WPM</span>
      </div>`;
    }
    list.innerHTML = html;
  }

  function renderClanInfo(clan, members) {
    const infoEl = document.getElementById('clan-header-info');
    const membersEl = document.getElementById('clan-members-list');
    const noClan = document.getElementById('clan-no-clan');
    const clanInfo = document.getElementById('clan-info');
    if (!clan) {
      if (noClan) noClan.style.display = '';
      if (clanInfo) clanInfo.style.display = 'none';
      return;
    }
    if (noClan) noClan.style.display = 'none';
    if (clanInfo) clanInfo.style.display = '';
    if (infoEl) {
      infoEl.innerHTML = `<div class="clan-name">${escapeHtml(clan.name)}</div>
        <div class="clan-code">Code: <strong>${escapeHtml(clan.code)}</strong></div>
        <div class="clan-member-count">${(members || []).length} / 50 members</div>`;
    }
    if (membersEl && members) {
      let html = '';
      for (const m of members) {
        html += `<div class="clan-member-row">
          <span class="clan-member-name">${escapeHtml(m.username)}</span>
          <span class="clan-member-role">${m.role || 'member'}</span>
        </div>`;
      }
      membersEl.innerHTML = html;
    }
  }

  function showLoginStreak(streak, reward) {
    const overlay = document.getElementById('login-streak-overlay');
    const textEl = document.getElementById('login-streak-text');
    const rewardEl = document.getElementById('login-streak-reward');
    if (!overlay || !textEl) return;
    textEl.textContent = streak + ' day streak!';
    if (rewardEl && reward) rewardEl.textContent = '+$' + reward.toLocaleString();
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.style.display = 'none'; }, 3000);
  }

  return {
    screens, els, showScreen, showWelcomeStep,
    setHomeUser, renderSentence, renderOpponentSentence, updatePlayerStats,
    updateOpponent, updateDuelMeter, showCountdown, hideCountdown, flashError,
    flashSentenceRange, flashOpponentRange,
    setMatchHeader, setGameScreenNameColors, showRoundResult, showMatchResult,
    focusInput, resetGameUI, showAttackNotification, showAttackSentNotification,
    showVsIntro, hideVsIntro, setSentenceHidden, showFinishTimer, hideFinishTimer,
    showProfile, showLeaderboard, showTimeTrialProfile, isPlaceholderEmail, getRankTier,
    xpToLevel, renderHeaderLevel, showXpGain, showLevelUp, getLevelBadge,
    renderHomeMiniLeaderboard, updateCoinDisplay, updateMoneyDisplay,
    renderShop, renderChallenges, showCoinGain, showMoneyGain,
    renderUpgradePanel, updateHomeUpgradeWidget, applyUsernameStyle,
    getEquippedColor, getEquippedCursorSkin, getEquippedBadge, getEquippedBadgeAnimated,
    getEquippedTitle, getEquippedEmotes, getEquippedNameEffect, getEquippedGradient,
    BADGE_SVGS, escapeHtml, applyUsernameStyleInline,
    CHAR_VALUE_UPGRADES,
    renderAchievements, showAchievementToast, showEarningsToast, renderFriendsList,
    renderAnalytics, renderRaceResults, renderClanInfo, showLoginStreak
  };
})();
