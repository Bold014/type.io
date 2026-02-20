(() => {
  const SUPABASE_URL = 'https://smnhckjzyawgzrgwzjcq.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtbmhja2p6eWF3Z3pyZ3d6amNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTI3MzksImV4cCI6MjA4NzEyODczOX0.Hpd_oSIYrCr6zv2OI1CdOpU0vVhaLFhDHRt4G0LLCnc';

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let currentUser = null;
  let guestUsername = null;
  let pendingUsername = '';
  let currentMode = 'quick';
  let opponentUsername = '';
  let currentSentence = '';
  let lastErrorCount = 0;
  let myProgress = 0;
  let oppProgress = 0;
  let currentInjectedRanges = [];
  let opponentSentence = '';
  let opponentTyped = '';
  let opponentInjectedRanges = [];

  function generateGuestName() {
    const id = Math.floor(Math.random() * 90000) + 10000;
    return `Guest_${id}`;
  }

  function getUsername() {
    if (currentUser) return currentUser.username;
    return guestUsername;
  }

  async function fetchProfile(token) {
    const res = await fetch('/api/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return null;
    return res.json();
  }

  function loginSuccess(profile, accessToken) {
    currentUser = profile;
    GameSocket.reconnectWithToken(accessToken);
    GameSocket.setAuth({
      username: currentUser.username,
      userId: currentUser.id,
      rating: currentUser.rating
    });
    UI.setHomeUser(currentUser.username, true, currentUser.rating, currentUser.xp);
    UI.showScreen('home');
  }

  async function init() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session) {
        const profile = await fetchProfile(session.access_token);
        if (profile) {
          loginSuccess(profile, session.access_token);
        }
      }
    } catch (_) {}

    sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED' && session) {
        GameSocket.reconnectWithToken(session.access_token);
      }
    });

    bindWelcomeEvents();
    bindHomeEvents();
    bindProfileEvents();
    bindLeaderboardEvents();
    bindGameEvents();
    bindResultEvents();
    bindSocketEvents();
  }

  // --- WELCOME SCREEN ---

  function bindWelcomeEvents() {
    UI.els.btnContinue.addEventListener('click', handleContinue);

    UI.els.welcomeUsername.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleContinue();
    });

    UI.els.btnCreateAccount.addEventListener('click', handleSignup);

    UI.els.welcomePassword.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSignup();
    });

    UI.els.btnSignIn.addEventListener('click', handleLogin);

    UI.els.welcomePasswordLogin.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });

    UI.els.btnBackSignup.addEventListener('click', (e) => {
      e.preventDefault();
      UI.showWelcomeStep('username');
    });

    UI.els.btnBackLogin.addEventListener('click', (e) => {
      e.preventDefault();
      UI.showWelcomeStep('username');
    });
  }

  async function handleContinue() {
    const input = UI.els.welcomeUsername.value.trim();

    if (!input) {
      guestUsername = generateGuestName();
      GameSocket.setAuth({ username: guestUsername, userId: null, rating: 1000 });
      UI.setHomeUser(guestUsername, false, null, null);
      UI.showScreen('home');
      return;
    }

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(input)) {
      UI.els.welcomeUsername.style.borderColor = 'var(--red)';
      setTimeout(() => { UI.els.welcomeUsername.style.borderColor = ''; }, 2000);
      return;
    }

    pendingUsername = input;
    UI.els.btnContinue.textContent = '...';
    UI.els.btnContinue.disabled = true;

    try {
      const res = await fetch('/api/check-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: input })
      });
      const data = await res.json();

      if (data.exists) {
        UI.showWelcomeStep('login', input);
      } else {
        UI.showWelcomeStep('signup', input);
      }
    } catch (err) {
      UI.els.welcomeUsername.style.borderColor = 'var(--red)';
      setTimeout(() => { UI.els.welcomeUsername.style.borderColor = ''; }, 2000);
    } finally {
      UI.els.btnContinue.textContent = 'CONTINUE';
      UI.els.btnContinue.disabled = false;
    }
  }

  async function handleSignup() {
    const rawEmail = UI.els.welcomeEmail.value.trim();
    const password = UI.els.welcomePassword.value;
    const email = rawEmail || `${pendingUsername.toLowerCase()}@noemail.typeduel.io`;

    if (password.length < 4) {
      UI.els.welcomeError.textContent = 'Password must be at least 4 characters';
      return;
    }

    UI.els.btnCreateAccount.textContent = '...';
    UI.els.btnCreateAccount.disabled = true;

    try {
      const authResult = await sb.auth.signUp({
        email,
        password,
        options: { data: { username: pendingUsername } }
      });

      if (authResult.error) {
        let msg = authResult.error.message;
        if (msg.includes('User already registered')) msg = 'Email already in use';
        UI.els.welcomeError.textContent = msg;
        return;
      }

      const session = authResult.data.session;
      const profile = await fetchProfile(session.access_token);
      if (!profile) {
        UI.els.welcomeError.textContent = 'Account created but profile not found. Try logging in.';
        return;
      }

      loginSuccess(profile, session.access_token);
    } catch (err) {
      UI.els.welcomeError.textContent = 'Connection error';
    } finally {
      UI.els.btnCreateAccount.textContent = 'CREATE ACCOUNT';
      UI.els.btnCreateAccount.disabled = false;
    }
  }

  async function handleLogin() {
    const password = UI.els.welcomePasswordLogin.value;

    if (!password) {
      UI.els.welcomeErrorLogin.textContent = 'Password is required';
      return;
    }

    UI.els.btnSignIn.textContent = '...';
    UI.els.btnSignIn.disabled = true;

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: pendingUsername, password })
      });
      const data = await res.json();

      if (!res.ok) {
        UI.els.welcomeErrorLogin.textContent = data.error || 'Invalid credentials';
        return;
      }

      await sb.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token
      });

      loginSuccess(data.profile, data.access_token);
    } catch (err) {
      UI.els.welcomeErrorLogin.textContent = 'Connection error';
    } finally {
      UI.els.btnSignIn.textContent = 'SIGN IN';
      UI.els.btnSignIn.disabled = false;
    }
  }

  function setMatchmakingText(heading, mode) {
    const h = document.getElementById('matchmaking-heading');
    if (h) h.innerHTML = heading + '<span class="dots"></span>';
    UI.els.matchmakingMode.textContent = mode;
  }

  // --- HOME SCREEN ---

  function bindHomeEvents() {
    UI.els.cardQuickplay.addEventListener('click', () => {
      const name = getUsername();
      if (!name) return;
      currentMode = 'quick';
      GameSocket.setAuth({ username: name, userId: currentUser?.id || null, rating: currentUser?.rating || 1000 });
      setMatchmakingText('Searching for opponent', 'QUICK DUEL');
      UI.showScreen('matchmaking');
      GameSocket.joinQueue('quick');
    });

    UI.els.cardRanked.addEventListener('click', () => {
      if (!currentUser) {
        UI.showWelcomeStep('username');
        UI.showScreen('welcome');
        return;
      }
      currentMode = 'ranked';
      GameSocket.setAuth({ username: currentUser.username, userId: currentUser.id, rating: currentUser.rating });
      setMatchmakingText('Searching for opponent', 'RANKED');
      UI.showScreen('matchmaking');
      GameSocket.joinQueue('ranked');
    });

    UI.els.btnCancelQueue.addEventListener('click', () => {
      GameSocket.leaveQueue();
      UI.showScreen('home');
    });

    UI.els.homeUserInfo.addEventListener('click', () => {
      if (currentUser) openProfile();
    });

    UI.els.homeLevelPill.addEventListener('click', () => {
      if (currentUser) openProfile();
    });

    UI.els.cardLeaderboard.addEventListener('click', () => {
      openLeaderboard('rating');
    });

    UI.els.btnHomeAuth.addEventListener('click', () => {
      UI.showWelcomeStep('username');
      UI.showScreen('welcome');
    });

    UI.els.cardAscend.addEventListener('click', () => {
      const name = getUsername();
      if (!name) return;
      currentMode = 'ascend';
      GameSocket.setAuth({ username: name, userId: currentUser?.id || null, rating: currentUser?.rating || 1000 });
      AscendClient.setMyUsername(name);
      UI.showScreen('ascend');
      GameSocket.emit('ascend:join');
    });

    UI.els.btnHomeLogout.addEventListener('click', () => doLogout());
  }

  async function doLogout() {
    await sb.auth.signOut();
    currentUser = null;
    GameSocket.clearToken();
    const name = guestUsername || generateGuestName();
    guestUsername = name;
    GameSocket.setAuth({ username: name, userId: null, rating: 1000 });
    UI.setHomeUser(name, false, null, null);
    UI.showWelcomeStep('username');
    UI.showScreen('welcome');
  }

  // --- LEADERBOARD ---

  let currentLbCategory = 'rating';

  async function openLeaderboard(category) {
    currentLbCategory = category || 'rating';
    UI.showScreen('leaderboard');
    UI.els.lbTableBody.innerHTML = '<div class="lb-loading">Loading...</div>';

    document.querySelectorAll('.lb-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.category === currentLbCategory);
    });

    try {
      const res = await fetch(`/api/leaderboard?category=${currentLbCategory}&limit=50`);
      const data = await res.json();
      UI.showLeaderboard(data, currentLbCategory);
    } catch (err) {
      UI.els.lbTableBody.innerHTML = '<div class="lb-empty">Failed to load</div>';
    }
  }

  function bindLeaderboardEvents() {
    UI.els.btnLeaderboardBack.addEventListener('click', () => {
      UI.showScreen('home');
    });

    document.querySelectorAll('.lb-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        openLeaderboard(tab.dataset.category);
      });
    });
  }

  // --- PROFILE SCREEN ---

  async function openProfile() {
    if (!currentUser) return;
    UI.showProfile(currentUser, null, null);

    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;

      const headers = { 'Authorization': `Bearer ${session.access_token}` };

      const [profileRes, historyRes, ascendRes] = await Promise.all([
        fetch('/api/me', { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/match-history?limit=10', { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/ascend-stats', { headers }).then(r => r.ok ? r.json() : null).catch(() => null)
      ]);

      if (profileRes) {
        currentUser = profileRes;
        UI.setHomeUser(currentUser.username, true, currentUser.rating, currentUser.xp);
      }

      UI.showProfile(currentUser, ascendRes, historyRes);
    } catch (_) {}
  }

  function bindProfileEvents() {
    UI.els.btnProfileBack.addEventListener('click', () => {
      UI.showScreen('home');
    });

    UI.els.btnProfileLogoutHeader.addEventListener('click', () => doLogout());

    UI.els.btnProfileSaveEmail.addEventListener('click', handleUpdateEmail);

    UI.els.profileEmailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleUpdateEmail();
    });
  }

  async function handleUpdateEmail() {
    const newEmail = UI.els.profileEmailInput.value.trim();
    UI.els.profileEmailError.textContent = '';
    UI.els.profileEmailSuccess.textContent = '';

    if (!newEmail) {
      UI.els.profileEmailError.textContent = 'Enter an email address';
      return;
    }

    UI.els.btnProfileSaveEmail.textContent = '...';
    UI.els.btnProfileSaveEmail.disabled = true;

    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        UI.els.profileEmailError.textContent = 'Not logged in';
        return;
      }

      const res = await fetch('/api/update-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ email: newEmail })
      });
      const data = await res.json();

      if (!res.ok) {
        UI.els.profileEmailError.textContent = data.error || 'Failed to update email';
        return;
      }

      currentUser.email = newEmail;
      UI.els.profileEmailCurrent.textContent = newEmail;
      UI.els.profileEmailCurrent.style.color = 'var(--text)';
      UI.els.profileEmailHint.style.display = 'none';
      UI.els.profileEmailInput.value = '';
      UI.els.profileEmailSuccess.textContent = 'Email updated';
    } catch (err) {
      UI.els.profileEmailError.textContent = 'Connection error';
    } finally {
      UI.els.btnProfileSaveEmail.textContent = 'SAVE EMAIL';
      UI.els.btnProfileSaveEmail.disabled = false;
    }
  }

  // --- GAME ---

  function bindGameEvents() {
    const input = UI.els.typingInput;

    function wordDeleteHandler(e, inputEl) {
      if (e.key === 'Backspace' && (e.ctrlKey || e.metaKey || e.altKey)) {
        e.preventDefault();
        const pos = inputEl.selectionStart;
        const text = inputEl.value;
        if (pos === 0) return;
        let i = pos - 1;
        while (i > 0 && text[i - 1] === ' ') i--;
        while (i > 0 && text[i - 1] !== ' ') i--;
        inputEl.value = text.slice(0, i) + text.slice(pos);
        inputEl.selectionStart = inputEl.selectionEnd = i;
        inputEl.dispatchEvent(new Event('input'));
      }
    }

    input.addEventListener('keydown', (e) => wordDeleteHandler(e, input));

    input.addEventListener('input', () => {
      if (!TypingEngine.isActive()) return;
      TypingEngine.handleInput(input.value);

      const state = TypingEngine.getState();
      const charStates = TypingEngine.getCharStates();

      UI.renderSentence(currentSentence, charStates, currentInjectedRanges);
      UI.updatePlayerStats(state);
      UI.els.playerWpmBar.textContent = state.wpm;
      myProgress = state.progress;
      UI.updateDuelMeter(myProgress, oppProgress);

      const currentErrors = state.uncorrectedErrors + state.correctedErrors;
      if (currentErrors > lastErrorCount) {
        UI.flashError();
      }
      lastErrorCount = currentErrors;

      GameSocket.sendTypingUpdate({
        position: state.position,
        typed: state.typed,
        wpm: state.wpm,
        errors: state.uncorrectedErrors,
        corrections: state.correctedErrors
      });
    });

    const ascendInput = document.getElementById('ascend-typing-input');
    if (ascendInput) {
      ascendInput.addEventListener('keydown', (e) => wordDeleteHandler(e, ascendInput));
      ascendInput.addEventListener('input', () => {
        AscendClient.handleInput();
      });
    }

    document.addEventListener('click', () => {
      if (UI.screens.game.classList.contains('active') && TypingEngine.isActive()) {
        input.focus();
      }
      if (UI.screens.ascend && UI.screens.ascend.classList.contains('active') && AscendClient.isActive()) {
        const ai = AscendClient.getInput();
        if (ai) ai.focus();
      }
    });
  }

  // --- SOCKET EVENTS ---

  function bindSocketEvents() {
    GameSocket.on('match:found', (data) => {
      opponentUsername = data.opponent;
      UI.els.opponentNameBar.textContent = data.opponent;
      if (UI.els.opponentNamePanel) UI.els.opponentNamePanel.textContent = data.opponent.toUpperCase();
      myProgress = 0;
      oppProgress = 0;
      UI.resetGameUI();
      UI.setSentenceHidden(true);
      UI.showScreen('game');
      UI.showVsIntro(getUsername(), data.opponent);
    });

    GameSocket.on('queue:waiting', () => {});

    GameSocket.on('round:countdown', (data) => {
      currentSentence = data.sentence;
      lastErrorCount = 0;
      myProgress = 0;
      oppProgress = 0;
      currentInjectedRanges = [];
      opponentSentence = data.sentence;
      opponentTyped = '';
      opponentInjectedRanges = [];

      const myUsername = getUsername();

      UI.hideFinishTimer();
      UI.hideVsIntro();
      UI.setSentenceHidden(true);

      UI.setMatchHeader(
        myUsername,
        opponentUsername,
        data.matchScore || {},
        data.round,
        data.totalRounds
      );

      UI.showScreen('game');
      UI.resetGameUI();

      const sourceEl = document.getElementById('quote-source');
      if (sourceEl) {
        sourceEl.textContent = data.source ? `— ${data.source}` : '';
      }

      const charStates = new Array(currentSentence.length).fill('pending');
      charStates[0] = 'current';
      UI.renderSentence(currentSentence, charStates);
      UI.renderOpponentSentence(opponentSentence, '', []);

      let count = data.seconds;
      UI.showCountdown(count);

      const countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
          UI.showCountdown(count);
        } else {
          clearInterval(countdownInterval);
        }
      }, 1000);
    });

    GameSocket.on('round:start', () => {
      UI.hideCountdown();
      UI.setSentenceHidden(false);
      UI.els.typingInput.value = '';
      UI.els.typingInput.disabled = false;
      UI.focusInput();

      TypingEngine.start(currentSentence, {
        onUpdate: (state) => {
          UI.updatePlayerStats(state);
        },
        onComplete: (state) => {
          UI.els.typingInput.disabled = true;
          GameSocket.sendRoundComplete({
            typed: state.typed,
            wpm: state.wpm,
            corrections: state.correctedErrors,
            time: state.time
          });
        }
      });
    });

    GameSocket.on('opponent:update', (data) => {
      UI.updateOpponent(data);
      oppProgress = data.progress || 0;
      UI.updateDuelMeter(myProgress, oppProgress);
      if (data.typed !== undefined) {
        opponentTyped = data.typed;
        UI.renderOpponentSentence(opponentSentence, opponentTyped, opponentInjectedRanges);
      }
    });

    GameSocket.on('attack:inject', (data) => {
      currentSentence = data.updatedSentence;
      currentInjectedRanges = data.injectedRanges || [];
      TypingEngine.updateSentence(currentSentence);
      const charStates = TypingEngine.getCharStates();
      UI.renderSentence(currentSentence, charStates, currentInjectedRanges);
      UI.showAttackNotification('inject', data.word);
    });

    GameSocket.on('attack:scramble', (data) => {
      currentSentence = data.updatedSentence;
      TypingEngine.updateSentence(currentSentence);
      const charStates = TypingEngine.getCharStates();
      UI.renderSentence(currentSentence, charStates, currentInjectedRanges);
      if (data.range) UI.flashSentenceRange(data.range[0], data.range[1], 'scramble');
      UI.showAttackNotification('scramble');
    });

    GameSocket.on('attack:chaos', (data) => {
      currentSentence = data.updatedSentence;
      TypingEngine.updateSentence(currentSentence);
      const charStates = TypingEngine.getCharStates();
      UI.renderSentence(currentSentence, charStates, currentInjectedRanges);
      if (data.range) UI.flashSentenceRange(data.range[0], data.range[1], 'chaos');
      UI.showAttackNotification('chaos');
    });

    GameSocket.on('attack:sent', (data) => {
      UI.showAttackSentNotification(data.type || 'inject');
      if (data.opponentSentence) {
        opponentSentence = data.opponentSentence;
        opponentInjectedRanges = data.opponentInjectedRanges || [];
        UI.renderOpponentSentence(opponentSentence, opponentTyped, opponentInjectedRanges);
        if (data.affectedRange && data.type !== 'inject') {
          UI.flashOpponentRange(data.affectedRange[0], data.affectedRange[1], data.type);
        }
      }
    });

    GameSocket.on('round:timer', (data) => {
      const myUsername = getUsername();
      const iFinished = data.finisher === myUsername;
      const label = iFinished
        ? `${opponentUsername} has ${data.seconds}s to finish`
        : `You have ${data.seconds}s to finish!`;
      UI.showFinishTimer(data.seconds, label);
    });

    GameSocket.on('round:result', (data) => {
      TypingEngine.reset();
      UI.hideFinishTimer();
      UI.els.typingInput.disabled = true;
      const myUsername = getUsername();
      UI.showRoundResult(data, myUsername);
    });

    GameSocket.on('match:result', (data) => {
      TypingEngine.reset();
      const myUsername = getUsername();

      if (data.xpGain && currentUser) {
        currentUser.xp = data.xpGain.newXp;
      }
      if (data.ratingChange && currentUser) {
        currentUser.rating = data.ratingChange.newRating;
      }
      if (currentUser) {
        UI.setHomeUser(currentUser.username, true, currentUser.rating, currentUser.xp);
      }

      UI.showMatchResult(data, myUsername);
      UI.showXpGain(data.xpGain);

      if (data.xpGain && data.xpGain.newLevel > data.xpGain.oldLevel) {
        setTimeout(() => {
          UI.showLevelUp(data.xpGain.oldLevel, data.xpGain.newLevel);
        }, 600);
      }
    });

    GameSocket.on('opponent:disconnected', () => {});

    GameSocket.on('error:message', (data) => {
      alert(data.message);
    });

    // --- ASCEND SOCKET EVENTS ---

    GameSocket.on('ascend:joined', (data) => {
      AscendClient.handleJoined(data);
    });

    GameSocket.on('ascend:countdown', (data) => {
      AscendClient.startCountdown(data);
    });

    GameSocket.on('ascend:start', (data) => {
      AscendClient.startGame(data);
    });

    GameSocket.on('ascend:sentence', (data) => {
      AscendClient.handleSentence(data);
    });

    GameSocket.on('ascend:update', (data) => {
      AscendClient.handleScoreboardUpdate(data);
    });

    GameSocket.on('ascend:attack:received', (data) => {
      AscendClient.handleAttackReceived(data);
    });

    GameSocket.on('ascend:attack:sent', (data) => {
      AscendClient.handleAttackSent(data);
    });

    GameSocket.on('ascend:tier', (data) => {
      AscendClient.handleTierUp(data);
    });

    GameSocket.on('ascend:momentum', (data) => {
      AscendClient.handleMomentumUp(data);
    });

    GameSocket.on('ascend:knockout', (data) => {
      AscendClient.handleKnockout(data);
    });

    GameSocket.on('ascend:eliminated', (data) => {
      AscendClient.handleEliminated(data);
    });

    GameSocket.on('ascend:burnout', (data) => {
      AscendClient.handleBurnout(data);
    });

    GameSocket.on('ascend:run:end', (data) => {
      if (data.xpGain && currentUser) {
        currentUser.xp = data.xpGain.newXp;
        UI.setHomeUser(currentUser.username, true, currentUser.rating, currentUser.xp);
      }
      AscendClient.handleRunEnd(data);
    });
  }

  // --- RESULT EVENTS ---

  function bindResultEvents() {
    UI.els.btnPlayAgain.addEventListener('click', () => {
      setMatchmakingText('Searching for opponent', currentMode === 'ranked' ? 'RANKED' : 'QUICK DUEL');
      UI.showScreen('matchmaking');
      GameSocket.joinQueue(currentMode);
    });

    UI.els.btnQuit.addEventListener('click', () => {
      UI.showScreen('home');
    });

    UI.els.btnAscendAgain.addEventListener('click', () => {
      AscendClient.reset();
      UI.showScreen('ascend');
      GameSocket.emit('ascend:join');
    });

    UI.els.btnAscendQuit.addEventListener('click', () => {
      AscendClient.reset();
      UI.showScreen('home');
    });
  }

  init();
})();
