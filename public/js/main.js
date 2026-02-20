(() => {
  let currentUser = null;
  let guestUsername = null;
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

  async function init() {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        currentUser = await res.json();
        GameSocket.setAuth({
          username: currentUser.username,
          userId: currentUser.id,
          rating: currentUser.rating
        });
        UI.setHomeUser(currentUser.username, true, currentUser.rating);
        UI.showScreen('home');
      }
    } catch (_) {}

    bindWelcomeEvents();
    bindHomeEvents();
    bindAuthEvents();
    bindGameEvents();
    bindResultEvents();
    bindSocketEvents();
  }

  // --- WELCOME SCREEN ---

  function bindWelcomeEvents() {
    UI.els.btnJoin.addEventListener('click', handleJoin);

    UI.els.welcomeUsername.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleJoin();
    });

    UI.els.welcomeLoginLink.addEventListener('click', (e) => {
      e.preventDefault();
      UI.showAuthModal('login');
    });
  }

  function handleJoin() {
    const input = UI.els.welcomeUsername.value.trim();
    guestUsername = input || generateGuestName();
    GameSocket.setAuth({ username: guestUsername, userId: null, rating: 1000 });
    UI.setHomeUser(guestUsername, false, null);
    UI.showScreen('home');
  }

  // --- HOME SCREEN ---

  function bindHomeEvents() {
    UI.els.cardQuickplay.addEventListener('click', () => {
      const name = getUsername();
      if (!name) return;
      currentMode = 'quick';
      GameSocket.setAuth({ username: name, userId: currentUser?.id || null, rating: currentUser?.rating || 1000 });
      UI.els.matchmakingMode.textContent = 'QUICK PLAY';
      UI.showScreen('matchmaking');
      GameSocket.joinQueue('quick');
    });

    UI.els.cardRanked.addEventListener('click', () => {
      if (!currentUser) {
        UI.showAuthModal('login');
        return;
      }
      currentMode = 'ranked';
      GameSocket.setAuth({ username: currentUser.username, userId: currentUser.id, rating: currentUser.rating });
      UI.els.matchmakingMode.textContent = 'RANKED';
      UI.showScreen('matchmaking');
      GameSocket.joinQueue('ranked');
    });

    UI.els.btnCancelQueue.addEventListener('click', () => {
      GameSocket.leaveQueue();
      UI.showScreen('home');
    });

    UI.els.btnHomeAuth.addEventListener('click', () => UI.showAuthModal('login'));

    UI.els.btnHomeLogout.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      currentUser = null;
      const name = guestUsername || generateGuestName();
      guestUsername = name;
      GameSocket.setAuth({ username: name, userId: null, rating: 1000 });
      UI.setHomeUser(name, false, null);
    });
  }

  // --- AUTH ---

  function bindAuthEvents() {
    UI.els.authCancel.addEventListener('click', () => UI.hideAuthModal());

    UI.els.authModal.addEventListener('click', (e) => {
      if (e.target === UI.els.authModal) UI.hideAuthModal();
    });

    UI.els.authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const mode = UI.els.authModal.dataset.mode;
      const username = UI.els.authUsername.value.trim();
      const password = UI.els.authPassword.value;

      try {
        const res = await fetch(`/api/${mode}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) {
          UI.els.authError.textContent = data.error;
          return;
        }
        currentUser = data;
        GameSocket.setAuth({ username: currentUser.username, userId: currentUser.id, rating: currentUser.rating });
        UI.setHomeUser(currentUser.username, true, currentUser.rating);
        UI.hideAuthModal();
        UI.showScreen('home');
      } catch (err) {
        UI.els.authError.textContent = 'Connection error';
      }
    });

    const switchLink = document.createElement('p');
    switchLink.className = 'form-error';
    switchLink.style.color = 'var(--text-dim)';
    switchLink.style.cursor = 'pointer';
    switchLink.style.textAlign = 'center';
    switchLink.style.marginTop = '8px';
    switchLink.id = 'auth-switch';
    UI.els.authForm.appendChild(switchLink);

    const updateSwitchLink = () => {
      const mode = UI.els.authModal.dataset.mode;
      if (mode === 'login') {
        switchLink.innerHTML = 'No account? <span style="color:var(--accent);font-weight:600">Sign up</span>';
      } else {
        switchLink.innerHTML = 'Have an account? <span style="color:var(--accent);font-weight:600">Log in</span>';
      }
    };

    const origShow = UI.showAuthModal;
    UI.showAuthModal = (mode) => {
      origShow(mode);
      updateSwitchLink();
    };

    switchLink.addEventListener('click', () => {
      const current = UI.els.authModal.dataset.mode;
      const next = current === 'login' ? 'signup' : 'login';
      UI.showAuthModal(next);
    });
  }

  // --- GAME ---

  function bindGameEvents() {
    const input = UI.els.typingInput;

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && (e.ctrlKey || e.metaKey || e.altKey)) {
        e.preventDefault();
        const pos = input.selectionStart;
        const text = input.value;
        if (pos === 0) return;
        let i = pos - 1;
        while (i > 0 && text[i - 1] === ' ') i--;
        while (i > 0 && text[i - 1] !== ' ') i--;
        input.value = text.slice(0, i) + text.slice(pos);
        input.selectionStart = input.selectionEnd = i;
        input.dispatchEvent(new Event('input'));
      }
    });

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

    document.addEventListener('click', () => {
      if (UI.screens.game.classList.contains('active') && TypingEngine.isActive()) {
        input.focus();
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
      UI.showMatchResult(data, myUsername);
    });

    GameSocket.on('opponent:disconnected', () => {});

    GameSocket.on('error:message', (data) => {
      alert(data.message);
    });
  }

  // --- RESULT EVENTS ---

  function bindResultEvents() {
    UI.els.btnPlayAgain.addEventListener('click', () => {
      UI.els.matchmakingMode.textContent = currentMode === 'ranked' ? 'RANKED' : 'QUICK PLAY';
      UI.showScreen('matchmaking');
      GameSocket.joinQueue(currentMode);
    });

    UI.els.btnQuit.addEventListener('click', () => {
      UI.showScreen('home');
    });
  }

  init();
})();
