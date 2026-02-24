(() => {
  const SUPABASE_URL = 'https://smnhckjzyawgzrgwzjcq.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtbmhja2p6eWF3Z3pyZ3d6amNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTI3MzksImV4cCI6MjA4NzEyODczOX0.Hpd_oSIYrCr6zv2OI1CdOpU0vVhaLFhDHRt4G0LLCnc';

  const sb = window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

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
  let opponentEquipped = [];

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

  function applyCursorSkinToContainer(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const equipped = (currentUser && currentUser.equipped) || [];
    const style = getEquippedCursorSkin(equipped);
    el.classList.remove('cursor-skin-block', 'cursor-skin-underline', 'cursor-skin-line', 'cursor-skin-dot');
    el.classList.add('cursor-skin-' + style);
  }

  function renderEmoteStrip() {
    const strip = document.getElementById('emote-strip');
    const buttons = document.getElementById('emote-strip-buttons');
    if (!strip || !buttons) return;
    const equipped = (currentUser && currentUser.equipped) || [];
    const emotes = getEquippedEmotes(equipped);
    buttons.innerHTML = '';
    if (emotes.length === 0) {
      strip.style.display = 'none';
      return;
    }
    emotes.forEach(text => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = text;
      btn.dataset.emoteText = text;
      buttons.appendChild(btn);
    });
    strip.style.display = 'flex';
  }

  function showEmoteToast(from, text) {
    const toast = document.getElementById('emote-toast');
    if (!toast) return;
    toast.textContent = from + ': ' + text;
    toast.classList.add('show');
    clearTimeout(showEmoteToast._tid);
    showEmoteToast._tid = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  function generateGuestName() {
    const id = Math.floor(Math.random() * 90000) + 10000;
    return `Guest_${id}`;
  }

  function getUsername() {
    if (currentUser) return currentUser.username;
    return guestUsername;
  }

  async function fetchProfile(token) {
    const res = await fetch(`/api/me?_=${Date.now()}`, {
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
    UI.setHomeUser(currentUser.username, true, currentUser.rating, currentUser.xp, currentUser.ranked_games_played, currentUser.coins, currentUser.equipped);
    refreshHomeUpgrade();
    UI.showScreen('home');
    loadChallenges();
  }

  function refreshHomeUpgrade() {
    if (!currentUser) return;
    UI.updateHomeUpgradeWidget({
      charValueLevel: currentUser.char_value_level || 0,
      totalCharsTyped: currentUser.total_chars_typed || 0,
      coins: currentUser.coins || 0
    });
  }

  async function init() {
    bindWelcomeEvents();
    bindHomeEvents();

    const _origShowScreen = UI.showScreen;
    let _lastScreen = null;
    UI.showScreen = function(name) {
      if (_lastScreen === 'home' && name !== 'home') {
        GameSocket.emit('globalchat:leave');
      }
      _origShowScreen(name);
      if (name === 'home') {
        loadHomeMiniLeaderboard();
        if (currentUser) loadChallenges();
        GameSocket.emit('globalchat:join');
        updateGlobalChatInputVisibility();
      }
      if (name === 'game') applyCursorSkinToContainer('typing-area');
      if (name === 'timetrial') applyCursorSkinToContainer('tt-typing-area');
      if (name === 'ascend') applyCursorSkinToContainer('ascend-typing-area');
      _lastScreen = name;
    };

    bindMultiplayerEvents();
    bindSingleplayerEvents();
    bindProfileEvents();
    bindLeaderboardEvents();
    bindGameEvents();
    bindResultEvents();
    bindSocketEvents();
    bindShopEvents();
    TimeTrial.init();

    window.addEventListener('money:earned', (e) => {
      if (!currentUser) return;
      const { newCoins, newTotalChars } = e.detail;
      if (newCoins != null) currentUser.coins = newCoins;
      if (newTotalChars != null) currentUser.total_chars_typed = newTotalChars;
      UI.updateMoneyDisplay(currentUser.coins);
      refreshHomeUpgrade();
    });

    scheduleChallengeRefresh();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && currentUser) loadChallenges();
    });

    if (window.APP_CONFIG && window.APP_CONFIG.platform === 'sbox') {
      if (UI.els.btnProfileLogoutHeader) UI.els.btnProfileLogoutHeader.style.display = 'none';
    }

    const urlParams = new URLSearchParams(window.location.search);
    const sboxToken = urlParams.get('token');
    const sboxSteamId = urlParams.get('steamid');

    if (sboxToken && sboxSteamId) {
      try {
        console.log('[STEAM AUTH] Attempting auth with steamid:', sboxSteamId);
        const steamRes = await fetch('/api/auth/steam', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ steamid: sboxSteamId, token: sboxToken })
        });
        if (steamRes.ok) {
          const steamData = await steamRes.json();
          console.log('[STEAM AUTH] Success, username:', steamData.profile?.username);
          if (sb) {
            await sb.auth.setSession({
              access_token: steamData.access_token,
              refresh_token: steamData.refresh_token
            });
          }
          loginSuccess(steamData.profile, steamData.access_token);
        } else {
          const errBody = await steamRes.text();
          console.error('[STEAM AUTH] Server returned', steamRes.status, errBody);
        }
      } catch (err) {
        console.error('[STEAM AUTH] Error:', err);
      }
      window.history.replaceState({}, '', '/');
    }

    if (sb) {
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
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          shopCache = null;
        }
        if (event === 'TOKEN_REFRESHED' && session) {
          GameSocket.reconnectWithToken(session.access_token);
        }
      });
    }
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

      if (!res.ok) {
        UI.els.welcomeUsername.style.borderColor = 'var(--red)';
        setTimeout(() => { UI.els.welcomeUsername.style.borderColor = ''; }, 2000);
        return;
      }

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
      if (!sb) { UI.els.welcomeError.textContent = 'Auth unavailable'; return; }
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

      if (sb) {
        await sb.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token
        });
      }

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

  // --- HOME MINI LEADERBOARD ---

  const miniLbCache = {};
  const MINI_LB_TTL = 60000;
  let miniLbCategory = 'coins';

  async function loadHomeMiniLeaderboard(category) {
    if (category) miniLbCategory = category;
    const cat = miniLbCategory;

    document.querySelectorAll('.mini-lb-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.mlbCat === cat)
    );

    const cached = miniLbCache[cat];
    if (cached && (Date.now() - cached.time) < MINI_LB_TTL) {
      UI.renderHomeMiniLeaderboard(cached.data, cat);
      return;
    }

    const body = document.getElementById('mini-lb-body');
    if (body) body.innerHTML = '<div class="mini-lb-loading">Loading...</div>';

    try {
      const res = await fetch(`/api/leaderboard?category=${cat}&limit=10`);
      const data = await res.json();
      miniLbCache[cat] = { data, time: Date.now() };
      if (miniLbCategory === cat) UI.renderHomeMiniLeaderboard(data, cat);
    } catch {
      if (body && miniLbCategory === cat) body.innerHTML = '<div class="mini-lb-empty">Failed to load</div>';
    }
  }

  // --- HOME SCREEN (Landing) ---

  function bindHomeEvents() {
    UI.els.btnLandingMultiplayer.addEventListener('click', () => {
      UI.showScreen('multiplayer');
      UI.els.btnMultiplayerBack.focus();
    });

    UI.els.btnLandingSingleplayer.addEventListener('click', () => {
      UI.showScreen('singleplayer');
      UI.els.btnSingleplayerBack.focus();
    });

    UI.els.btnLandingLeaderboard.addEventListener('click', () => {
      openLeaderboard('rating');
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

    UI.els.btnLandingShop.addEventListener('click', () => {
      if (currentUser) openShop();
    });

    UI.els.btnHomeAuth.addEventListener('click', () => {
      UI.showWelcomeStep('username');
      UI.showScreen('welcome');
    });

    UI.els.btnAscendLobbyStart.addEventListener('click', () => {
      const name = getUsername();
      if (!name) return;
      AscendClient.stopPeek();
      GameSocket.setAuth({ username: name, userId: currentUser?.id || null, rating: currentUser?.rating || 1000 });
      AscendClient.setMyUsername(name);
      UI.showScreen('ascend');
      GameSocket.emit('ascend:join');
    });

    UI.els.btnAscendLobbyBack.addEventListener('click', () => {
      AscendClient.stopPeek();
      UI.showScreen('home');
    });

    UI.els.btnHomeLogout.addEventListener('click', () => doLogout());

    document.getElementById('btn-home-upgrade')?.addEventListener('click', () => {
      handleUpgradeCharValue();
    });

    document.getElementById('btn-mini-lb-view-all')?.addEventListener('click', () => {
      openLeaderboard(miniLbCategory);
    });

    document.querySelectorAll('.mini-lb-tab').forEach(tab => {
      tab.addEventListener('click', () => loadHomeMiniLeaderboard(tab.dataset.mlbCat));
    });

    loadHomeMiniLeaderboard();

    document.addEventListener('keydown', (e) => {
      if (!UI.screens.home.classList.contains('active')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.activeElement === UI.els.globalChatInput) return;
      const map = {
        m: 'btn-landing-multiplayer',
        s: 'btn-landing-singleplayer',
        l: 'btn-landing-leaderboard',
        b: 'btn-landing-shop',
        d: 'btn-landing-discord'
      };
      const id = map[e.key.toLowerCase()];
      if (!id) return;
      e.preventDefault();
      const row = document.getElementById(id);
      if (!row) return;
      row.classList.add('key-active');
      setTimeout(() => row.classList.remove('key-active'), 180);
      row.click();
    });

    bindGlobalChatEvents();
  }

  // --- GLOBAL CHAT ---

  function updateGlobalChatInputVisibility() {
    if (UI.els.globalChatInputArea) {
      UI.els.globalChatInputArea.style.display = currentUser ? 'flex' : 'none';
    }
    if (UI.els.globalChatLoginHint) {
      UI.els.globalChatLoginHint.style.display = currentUser ? 'none' : '';
    }
  }

  function renderGlobalChatMessage(msg) {
    const container = UI.els.globalChatMessages;
    if (!container) return;

    const equipped = msg.equipped || [];
    const badge = UI.getEquippedBadge(equipped);
    const title = UI.getEquippedTitle(equipped);

    const div = document.createElement('div');
    div.className = 'gchat-msg';

    const header = document.createElement('div');
    header.className = 'gchat-msg-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'gchat-msg-name';
    nameSpan.textContent = (msg.username || '').toUpperCase();
    UI.applyUsernameStyle(nameSpan, equipped);
    header.appendChild(nameSpan);

    if (badge && UI.BADGE_SVGS[badge]) {
      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'gchat-msg-badge';
      badgeSpan.innerHTML = UI.BADGE_SVGS[badge];
      header.appendChild(badgeSpan);
    }
    if (title) {
      const titleSpan = document.createElement('span');
      titleSpan.className = 'gchat-msg-title';
      titleSpan.textContent = title;
      header.appendChild(titleSpan);
    }

    const textDiv = document.createElement('div');
    textDiv.className = 'gchat-msg-text';
    textDiv.textContent = msg.text;

    div.appendChild(header);
    div.appendChild(textDiv);
    container.appendChild(div);

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
    if (isNearBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function renderGlobalChatHistory(messages) {
    const container = UI.els.globalChatMessages;
    if (!container) return;
    container.innerHTML = '';
    if (!messages || messages.length === 0) {
      container.innerHTML = '<div class="gchat-empty">No messages yet. Say hello!</div>';
      return;
    }
    messages.forEach(msg => renderGlobalChatMessage(msg));
    container.scrollTop = container.scrollHeight;
  }

  function sendGlobalChatMessage() {
    const input = UI.els.globalChatInput;
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    GameSocket.emit('globalchat:send', { text });
  }

  const activeWagerCards = new Map();
  let currentWagerMode = null;

  function renderWagerCard(wager) {
    const container = UI.els.globalChatMessages;
    if (!container) return;

    const empty = container.querySelector('.gchat-empty');
    if (empty) empty.remove();

    const div = document.createElement('div');
    div.className = 'gchat-wager-card';
    div.dataset.wagerId = wager.wagerId;

    const equipped = wager.equipped || [];
    const badge = UI.getEquippedBadge(equipped);
    const title = UI.getEquippedTitle(equipped);

    const header = document.createElement('div');
    header.className = 'gchat-wager-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'gchat-msg-name';
    nameSpan.textContent = (wager.username || '').toUpperCase();
    UI.applyUsernameStyle(nameSpan, equipped);
    header.appendChild(nameSpan);

    if (badge && UI.BADGE_SVGS[badge]) {
      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'gchat-msg-badge';
      badgeSpan.innerHTML = UI.BADGE_SVGS[badge];
      header.appendChild(badgeSpan);
    }
    if (title) {
      const titleSpan = document.createElement('span');
      titleSpan.className = 'gchat-msg-title';
      titleSpan.textContent = title;
      header.appendChild(titleSpan);
    }

    const body = document.createElement('div');
    body.className = 'gchat-wager-body';

    const amountSpan = document.createElement('span');
    amountSpan.className = 'gchat-wager-amount';
    amountSpan.textContent = '$' + wager.amount.toLocaleString();

    let descText;
    if (wager.targetUsername) {
      descText = ' wager duel to @' + wager.targetUsername + '!';
    } else {
      descText = ' wager duel — Best of 3!';
    }

    const descSpan = document.createElement('span');
    descSpan.className = 'gchat-wager-desc';
    descSpan.textContent = descText;

    body.appendChild(amountSpan);
    body.appendChild(descSpan);

    const timerSpan = document.createElement('span');
    timerSpan.className = 'gchat-wager-timer';
    const remaining = Math.max(0, Math.ceil((wager.expiresAt - Date.now()) / 1000));
    timerSpan.textContent = remaining + 's';

    const footer = document.createElement('div');
    footer.className = 'gchat-wager-footer';

    const myUsername = getUsername();
    const isChallenger = wager.username.toLowerCase() === (myUsername || '').toLowerCase();
    const isTarget = !wager.targetUsername || wager.targetUsername.toLowerCase() === (myUsername || '').toLowerCase();

    if (!isChallenger && isTarget && currentUser) {
      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'gchat-wager-accept-btn';
      acceptBtn.textContent = 'ACCEPT';
      acceptBtn.addEventListener('click', () => {
        GameSocket.emit('wager:accept', { wagerId: wager.wagerId });
        acceptBtn.disabled = true;
        acceptBtn.textContent = '...';
      });
      footer.appendChild(acceptBtn);
    } else if (isChallenger) {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'gchat-wager-cancel-btn';
      cancelBtn.textContent = 'CANCEL';
      cancelBtn.addEventListener('click', () => {
        GameSocket.emit('wager:cancel');
      });
      footer.appendChild(cancelBtn);
    }

    footer.appendChild(timerSpan);

    div.appendChild(header);
    div.appendChild(body);
    div.appendChild(footer);
    container.appendChild(div);

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
    if (isNearBottom) container.scrollTop = container.scrollHeight;

    const timerInterval = setInterval(() => {
      const r = Math.max(0, Math.ceil((wager.expiresAt - Date.now()) / 1000));
      timerSpan.textContent = r + 's';
      if (r <= 0) {
        clearInterval(timerInterval);
        expireWagerCard(wager.wagerId);
      }
    }, 1000);

    activeWagerCards.set(wager.wagerId, { el: div, timerInterval });
  }

  function expireWagerCard(wagerId) {
    const card = activeWagerCards.get(wagerId);
    if (!card) return;
    clearInterval(card.timerInterval);
    card.el.classList.add('gchat-wager-expired');
    const btn = card.el.querySelector('.gchat-wager-accept-btn, .gchat-wager-cancel-btn');
    if (btn) btn.remove();
    const timer = card.el.querySelector('.gchat-wager-timer');
    if (timer) timer.textContent = 'EXPIRED';
    activeWagerCards.delete(wagerId);
  }

  function acceptWagerCard(wagerId, challengerUsername, accepterUsername, amount) {
    const card = activeWagerCards.get(wagerId);
    if (card) {
      clearInterval(card.timerInterval);
      card.el.classList.add('gchat-wager-accepted');
      const btn = card.el.querySelector('.gchat-wager-accept-btn, .gchat-wager-cancel-btn');
      if (btn) btn.remove();
      const timer = card.el.querySelector('.gchat-wager-timer');
      if (timer) timer.textContent = 'MATCHED!';
      activeWagerCards.delete(wagerId);
    }

    const container = UI.els.globalChatMessages;
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'gchat-wager-matched-msg';
    div.textContent = accepterUsername.toUpperCase() + ' accepted ' + challengerUsername.toUpperCase() + '\'s $' + amount.toLocaleString() + ' wager!';
    container.appendChild(div);
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
    if (isNearBottom) container.scrollTop = container.scrollHeight;
  }

  function renderWagerTip() {
    const container = UI.els.globalChatMessages;
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'gchat-system-tip';
    div.innerHTML = '<span class="gchat-tip-icon">$</span> <strong>Tip:</strong> Type <code>/wager 500</code> to challenge anyone, or <code>/wager 500 @username</code> to duel someone specific!';
    container.appendChild(div);
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
    if (isNearBottom) container.scrollTop = container.scrollHeight;
  }

  function bindGlobalChatEvents() {
    GameSocket.on('globalchat:history', (messages) => {
      renderGlobalChatHistory(messages);
    });

    GameSocket.on('globalchat:message', (msg) => {
      const container = UI.els.globalChatMessages;
      if (container) {
        const empty = container.querySelector('.gchat-empty');
        if (empty) empty.remove();
      }
      renderGlobalChatMessage(msg);
    });

    GameSocket.on('globalchat:wager', (wager) => {
      renderWagerCard(wager);
    });

    GameSocket.on('wager:expired', (data) => {
      expireWagerCard(data.wagerId);
    });

    GameSocket.on('wager:accepted', (data) => {
      acceptWagerCard(data.wagerId, data.challengerUsername, data.accepterUsername, data.amount);
    });

    GameSocket.on('wager:error', (data) => {
      showWagerToast(data.message);
    });

    GameSocket.on('globalchat:wager-tip', () => {
      renderWagerTip();
    });

    if (UI.els.globalChatSend) {
      UI.els.globalChatSend.addEventListener('click', sendGlobalChatMessage);
    }

    if (UI.els.globalChatInput) {
      UI.els.globalChatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendGlobalChatMessage();
        }
      });
    }

    const wagerBtn = document.getElementById('global-chat-wager');
    if (wagerBtn) {
      wagerBtn.addEventListener('click', () => {
        const input = UI.els.globalChatInput;
        if (!input) return;
        if (!input.value.startsWith('/wager')) {
          input.value = '/wager ';
        }
        input.focus();
      });
    }
  }

  function showWagerToast(message) {
    const flash = document.getElementById('error-flash');
    if (!flash) return;
    flash.textContent = message;
    flash.classList.add('show', 'wager-toast');
    clearTimeout(showWagerToast._tid);
    showWagerToast._tid = setTimeout(() => {
      flash.classList.remove('show', 'wager-toast');
      flash.textContent = '';
    }, 3000);
  }

  // --- MULTIPLAYER MENU ---

  function bindMultiplayerEvents() {
    UI.els.btnMultiplayerBack.addEventListener('click', () => {
      UI.showScreen('home');
    });

    document.addEventListener('keydown', (e) => {
      if (!UI.screens.multiplayer.classList.contains('active')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const map = {
        c: 'card-ascend',
        d: 'card-quickplay',
        r: 'card-ranked'
      };
      const id = map[e.key.toLowerCase()];
      if (!id) return;
      e.preventDefault();
      const row = document.getElementById(id);
      if (!row) return;
      row.classList.add('key-active');
      setTimeout(() => row.classList.remove('key-active'), 180);
      row.click();
    });

    UI.els.cardAscend.addEventListener('click', () => {
      const name = getUsername();
      if (!name) return;
      currentMode = 'ascend';
      UI.showScreen('ascendLobby');
      AscendClient.startPeek();
    });

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
      if (UI.xpToLevel(currentUser.xp || 0) < 5) return;
      currentMode = 'ranked';
      GameSocket.setAuth({ username: currentUser.username, userId: currentUser.id, rating: currentUser.rating });
      setMatchmakingText('Searching for opponent', 'RANKED');
      UI.showScreen('matchmaking');
      GameSocket.joinQueue('ranked');
    });
  }

  // --- SINGLEPLAYER MENU ---

  function bindSingleplayerEvents() {
    UI.els.btnSingleplayerBack.addEventListener('click', () => {
      UI.showScreen('home');
    });

    UI.els.cardTimeTrial.addEventListener('click', () => {
      TimeTrial.showDurationSelect();
      UI.showScreen('timetrial');
    });

    UI.els.cardTowerDefense.addEventListener('click', () => {
      UI.showScreen('towerdefenseLobby');
    });

    document.addEventListener('keydown', (e) => {
      if (!UI.screens.singleplayer.classList.contains('active')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 't') {
        e.preventDefault();
        const row = document.getElementById('card-timetrial');
        if (!row) return;
        row.classList.add('key-active');
        setTimeout(() => row.classList.remove('key-active'), 180);
        row.click();
      } else if (key === 'd') {
        e.preventDefault();
        const row = document.getElementById('card-towerdefense');
        if (!row) return;
        row.classList.add('key-active');
        setTimeout(() => row.classList.remove('key-active'), 180);
        row.click();
      }
    });
  }

  async function doLogout() {
    if (sb) await sb.auth.signOut();
    currentUser = null;
    shopCache = null;
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
  let currentLbDuration = 15;

  async function openLeaderboard(category, duration) {
    currentLbCategory = category || 'rating';
    if (duration !== undefined) currentLbDuration = duration;
    UI.showScreen('leaderboard');
    UI.els.lbTableBody.innerHTML = '<div class="lb-loading">Loading...</div>';

    document.querySelectorAll('.lb-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.category === currentLbCategory);
    });

    let url = `/api/leaderboard?category=${currentLbCategory}&limit=50`;
    if (currentLbCategory === 'time_trial') {
      url += `&duration=${currentLbDuration}`;
      document.querySelectorAll('.lb-duration-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.duration) === currentLbDuration);
      });
    }

    try {
      const res = await fetch(url);
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

    document.querySelectorAll('.lb-duration-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openLeaderboard('time_trial', parseInt(btn.dataset.duration));
      });
    });
  }

  // --- PROFILE SCREEN ---

  async function openProfile() {
    if (!currentUser) return;
    UI.showProfile(currentUser, null, null, null);

    try {
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;

      const headers = { 'Authorization': `Bearer ${session.access_token}` };

      const [profileRes, historyRes, ascendRes, ttRes] = await Promise.all([
        fetch('/api/me', { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/match-history?limit=10', { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/ascend-stats', { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/time-trial-stats', { headers }).then(r => r.ok ? r.json() : null).catch(() => null)
      ]);

      if (profileRes) {
        currentUser = profileRes;
        UI.setHomeUser(currentUser.username, true, currentUser.rating, currentUser.xp, currentUser.ranked_games_played, currentUser.coins, currentUser.equipped);
        refreshHomeUpgrade();
      }

      UI.showProfile(currentUser, ascendRes, historyRes, ttRes);
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
      if (!sb) { UI.els.profileEmailError.textContent = 'Not logged in'; return; }
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

  // --- SHOP & CHALLENGES ---

  let shopCache = null;
  let currentShopCategory = 'username_color';

  async function loadChallenges() {
    if (!currentUser) return;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/challenges?_=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (res.ok) {
        const { daily, weekly } = await res.json();
        UI.renderChallenges(daily, weekly);
      } else {
        console.warn('loadChallenges: API returned', res.status);
      }
    } catch (err) {
      console.warn('loadChallenges error:', err);
    }
  }

  function scheduleChallengeRefresh() {
    const now = new Date();
    const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 1));
    const msUntil = nextMidnight.getTime() - now.getTime();
    setTimeout(() => {
      if (currentUser) loadChallenges();
      scheduleChallengeRefresh();
    }, msUntil);
  }

  async function openShop(category) {
    if (category) currentShopCategory = category;
    UI.showScreen('shop');

    document.querySelectorAll('.shop-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.shopCat === currentShopCategory)
    );

    if (shopCache) {
      const upgradeData = currentUser ? { charValueLevel: currentUser.char_value_level || 0, totalCharsTyped: currentUser.total_chars_typed || 0, coins: currentUser.coins || 0 } : {};
      UI.renderShop(shopCache.items, shopCache.inventory, shopCache.equipped, shopCache.coins, currentShopCategory, upgradeData);
      return;
    }

    if (UI.els.shopGrid) UI.els.shopGrid.innerHTML = '<div class="shop-loading">Loading...</div>';

    try {
      const session = sb ? (await sb.auth.getSession()).data.session : null;
      const headers = session ? { 'Authorization': `Bearer ${session.access_token}` } : {};
      const res = await fetch(`/api/shop?_=${Date.now()}`, { headers });
      const data = await res.json();
      shopCache = data;
      if (currentUser) currentUser.coins = data.coins;
      const upgradeData = currentUser ? { charValueLevel: currentUser.char_value_level || 0, totalCharsTyped: currentUser.total_chars_typed || 0, coins: currentUser.coins || 0 } : {};
      UI.renderShop(data.items, data.inventory, data.equipped, data.coins, currentShopCategory, upgradeData);
    } catch (_) {
      if (UI.els.shopGrid) UI.els.shopGrid.innerHTML = '<div class="shop-empty">Failed to load shop</div>';
    }
  }

  async function handleShopAction(itemId, category, action) {
    if (!currentUser || !sb) return;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      };

      if (action === 'buy') {
        const res = await fetch('/api/shop/purchase', {
          method: 'POST', headers,
          body: JSON.stringify({ itemId })
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error || 'Purchase failed');
          return;
        }
        currentUser.coins = data.newBalance;
        if (shopCache) {
          shopCache.coins = data.newBalance;
          shopCache.inventory.push({ item_id: itemId, purchased_at: new Date().toISOString() });
        }
      } else if (action === 'equip') {
        const res = await fetch('/api/shop/equip', {
          method: 'POST', headers,
          body: JSON.stringify({ itemId, category })
        });
        if (!res.ok) return;
        if (shopCache) {
          shopCache.equipped = shopCache.equipped.filter(e => e.category !== category);
          shopCache.equipped.push({ category, item_id: itemId });
        }
        const profile = await fetchProfile(session.access_token);
        if (profile && currentUser) { currentUser.equipped = profile.equipped || []; shopCache.equipped = profile.equipped || []; }
      } else if (action === 'unequip') {
        const res = await fetch('/api/shop/unequip', {
          method: 'POST', headers,
          body: JSON.stringify({ category })
        });
        if (!res.ok) return;
        if (shopCache) {
          shopCache.equipped = shopCache.equipped.filter(e => e.category !== category);
        }
        const profile = await fetchProfile(session.access_token);
        if (profile && currentUser) { currentUser.equipped = profile.equipped || []; shopCache.equipped = profile.equipped || []; }
      }

      UI.setHomeUser(currentUser.username, true, currentUser.rating, currentUser.xp, currentUser.ranked_games_played, currentUser.coins, currentUser.equipped);
      refreshHomeUpgrade();
      if (shopCache) {
        const upgradeData = currentUser ? { charValueLevel: currentUser.char_value_level || 0, totalCharsTyped: currentUser.total_chars_typed || 0, coins: currentUser.coins || 0 } : {};
        UI.renderShop(shopCache.items, shopCache.inventory, shopCache.equipped, shopCache.coins, currentShopCategory, upgradeData);
      }
    } catch (_) {}
  }

  function bindShopEvents() {
    UI.els.btnShopBack.addEventListener('click', () => {
      UI.showScreen('home');
    });

    document.querySelectorAll('.shop-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        currentShopCategory = tab.dataset.shopCat;
        document.querySelectorAll('.shop-tab').forEach(t =>
          t.classList.toggle('active', t.dataset.shopCat === currentShopCategory)
        );
        if (shopCache) {
          const upgradeData = currentUser ? { charValueLevel: currentUser.char_value_level || 0, totalCharsTyped: currentUser.total_chars_typed || 0, coins: currentUser.coins || 0 } : {};
          UI.renderShop(shopCache.items, shopCache.inventory, shopCache.equipped, shopCache.coins, currentShopCategory, upgradeData);
        }
      });
    });

    UI.els.shopGrid.addEventListener('click', (e) => {
      const upgradeBtn = e.target.closest('#btn-upgrade-char-value');
      if (upgradeBtn) {
        handleUpgradeCharValue();
        return;
      }

      const btn = e.target.closest('.shop-card-btn');
      if (!btn) return;
      const card = btn.closest('.shop-card');
      if (!card) return;
      const itemId = card.dataset.itemId;
      const cat = card.dataset.itemCat;
      const action = btn.dataset.action;
      handleShopAction(itemId, cat, action);
    });
  }

  async function handleUpgradeCharValue() {
    if (!currentUser || !sb) return;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/upgrade/char-value', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Upgrade failed');
        return;
      }

      currentUser.char_value_level = data.newLevel;
      currentUser.coins = data.newBalance;
      if (shopCache) shopCache.coins = data.newBalance;

      UI.setHomeUser(currentUser.username, true, currentUser.rating, currentUser.xp, currentUser.ranked_games_played, currentUser.coins, currentUser.equipped);
      refreshHomeUpgrade();
      const upgradeData = { charValueLevel: currentUser.char_value_level || 0, totalCharsTyped: currentUser.total_chars_typed || 0, coins: currentUser.coins || 0 };
      if (shopCache) {
        UI.renderShop(shopCache.items, shopCache.inventory, shopCache.equipped, shopCache.coins, currentShopCategory, upgradeData);
      }
    } catch (_) {
      alert('Connection error');
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

      UI.renderSentence(currentSentence, charStates, currentInjectedRanges, state.typed);
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

    const tdInput = document.getElementById('td-typing-input');
    if (tdInput) {
      tdInput.addEventListener('input', () => {
        TowerDefense.handleInput();
      });
    }

    const emoteStripButtons = document.getElementById('emote-strip-buttons');
    if (emoteStripButtons) {
      emoteStripButtons.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn && btn.dataset.emoteText) {
          GameSocket.emit('emote:send', { text: btn.dataset.emoteText });
        }
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
      if (UI.screens.timetrial && UI.screens.timetrial.classList.contains('active') && TimeTrial.isActive()) {
        const ti = TimeTrial.getInput();
        if (ti) ti.focus();
      }
      if (UI.screens.towerdefense && UI.screens.towerdefense.classList.contains('active') && TowerDefense.isActive()) {
        const di = TowerDefense.getInput();
        if (di) di.focus();
      }
    });
  }

  // --- SOCKET EVENTS ---

  function bindSocketEvents() {
    GameSocket.on('match:found', (data) => {
      opponentUsername = data.opponent;
      opponentEquipped = data.opponentEquipped || [];
      currentWagerMode = data.wagerAmount ? 'wager' : null;
      UI.els.opponentNameBar.textContent = data.opponent;
      if (UI.els.opponentNamePanel) UI.els.opponentNamePanel.textContent = data.opponent.toUpperCase();
      myProgress = 0;
      oppProgress = 0;
      UI.resetGameUI();
      UI.setSentenceHidden(true);
      UI.showScreen('game');
      UI.showVsIntro(getUsername(), data.opponent, (currentUser && currentUser.equipped) || [], opponentEquipped);
      UI.setGameScreenNameColors((currentUser && currentUser.equipped) || [], opponentEquipped, data.opponent);
      renderEmoteStrip();
    });

    GameSocket.on('queue:waiting', () => {});

    GameSocket.on('emote:receive', (data) => {
      showEmoteToast(data.from || 'Opponent', data.text || '');
    });

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
      UI.setGameScreenNameColors((currentUser && currentUser.equipped) || [], opponentEquipped, opponentUsername);

      UI.showScreen('game');
      UI.resetGameUI();
      renderEmoteStrip();

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
      UI.renderSentence(currentSentence, charStates, currentInjectedRanges, TypingEngine.getState().typed);
      UI.showAttackNotification('inject', data.word);
    });

    GameSocket.on('attack:scramble', (data) => {
      currentSentence = data.updatedSentence;
      TypingEngine.updateSentence(currentSentence);
      const charStates = TypingEngine.getCharStates();
      UI.renderSentence(currentSentence, charStates, currentInjectedRanges, TypingEngine.getState().typed);
      if (data.range) UI.flashSentenceRange(data.range[0], data.range[1], 'scramble');
      UI.showAttackNotification('scramble');
    });

    GameSocket.on('attack:chaos', (data) => {
      currentSentence = data.updatedSentence;
      TypingEngine.updateSentence(currentSentence);
      const charStates = TypingEngine.getCharStates();
      UI.renderSentence(currentSentence, charStates, currentInjectedRanges, TypingEngine.getState().typed);
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
      UI.showRoundResult(data, myUsername, (currentUser && currentUser.equipped) || [], opponentEquipped);
    });

    GameSocket.on('match:result', (data) => {
      TypingEngine.reset();
      const myUsername = getUsername();

      if (data.xpGain && currentUser) {
        currentUser.xp = data.xpGain.newXp;
      }
      if (data.ratingChange && currentUser) {
        currentUser.rating = data.ratingChange.newRating;
        if (data.ratingChange.rankedGamesPlayed != null) {
          currentUser.ranked_games_played = data.ratingChange.rankedGamesPlayed;
        }
      }
      if (data.xpGain && data.xpGain.coinsGained != null) {
        currentUser.coins = data.xpGain.newCoins;
      }
      if (data.wagerResult && data.wagerResult.newBalance != null && currentUser) {
        currentUser.coins = data.wagerResult.newBalance;
      }
      if (currentUser) {
        UI.setHomeUser(currentUser.username, true, currentUser.rating, currentUser.xp, currentUser.ranked_games_played, currentUser.coins, currentUser.equipped);
        refreshHomeUpgrade();
      }

      currentWagerMode = data.wagerAmount ? 'wager' : null;

      UI.showMatchResult(data, myUsername);
      UI.showXpGain(data.xpGain);
      UI.showMoneyGain(data.xpGain?.coinsGained, 'match', data.xpGain?.charsTyped, data.xpGain?.charValue);
      showWagerResult(data);

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

    GameSocket.on('ascend:hp', (data) => {
      AscendClient.handleHpUpdate(data);
    });

    GameSocket.on('ascend:knockout', (data) => {
      AscendClient.handleKnockout(data);
    });

    GameSocket.on('ascend:eliminated', (data) => {
      AscendClient.handleEliminated(data);
    });

    GameSocket.on('ascend:floor', (data) => {
      AscendClient.handleFloorUpdate(data);
    });

    GameSocket.on('ascend:run:end', (data) => {
      if (data.xpGain && currentUser) {
        currentUser.xp = data.xpGain.newXp;
        if (data.xpGain.newCoins != null) currentUser.coins = data.xpGain.newCoins;
      }
      if (currentUser) {
        UI.setHomeUser(currentUser.username, true, currentUser.rating, currentUser.xp, currentUser.ranked_games_played, currentUser.coins, currentUser.equipped);
        refreshHomeUpgrade();
      }
      UI.showMoneyGain(data.coinsGained, 'ascend', data.xpGain?.charsTyped, data.xpGain?.charValue);
      AscendClient.handleRunEnd(data);
    });
  }

  function showWagerResult(data) {
    const wagerDisplay = document.getElementById('wager-result-display');
    if (!wagerDisplay) return;
    if (!data.wagerResult) {
      wagerDisplay.style.display = 'none';
      return;
    }
    const wr = data.wagerResult;
    wagerDisplay.style.display = '';
    const amount = document.getElementById('wager-result-amount');
    if (wr.refunded) {
      wagerDisplay.className = 'wager-result-display wager-result-draw';
      if (amount) amount.textContent = 'Wager refunded: $' + wr.amount.toLocaleString() + ' returned';
    } else if (wr.won) {
      wagerDisplay.className = 'wager-result-display wager-result-win';
      if (amount) amount.textContent = 'You won $' + (wr.payout - wr.amount).toLocaleString() + ' from the wager!';
    } else {
      wagerDisplay.className = 'wager-result-display wager-result-loss';
      if (amount) amount.textContent = 'You lost $' + wr.amount.toLocaleString() + ' from the wager.';
    }
  }

  // --- RESULT EVENTS ---

  function bindResultEvents() {
    UI.els.btnPlayAgain.addEventListener('click', () => {
      if (currentWagerMode === 'wager') {
        UI.showScreen('home');
        return;
      }
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

    if (UI.els.btnAscendExit) {
      UI.els.btnAscendExit.addEventListener('click', () => {
        GameSocket.emit('ascend:leave');
        AscendClient.reset();
        UI.showScreen('home');
      });
    }

    const btnTdLobbyBack = document.getElementById('btn-td-lobby-back');
    const btnTdLobbyStart = document.getElementById('btn-td-lobby-start');
    const btnTdAgain = document.getElementById('btn-td-again');
    const btnTdQuit = document.getElementById('btn-td-quit');
    const btnTdBack = document.getElementById('btn-td-back');

    if (btnTdLobbyBack) {
      btnTdLobbyBack.addEventListener('click', () => {
        UI.showScreen('singleplayer');
      });
    }

    if (btnTdLobbyStart) {
      btnTdLobbyStart.addEventListener('click', () => {
        UI.showScreen('towerdefense');
        TowerDefense.startGame();
      });
    }

    if (btnTdAgain) {
      btnTdAgain.addEventListener('click', () => {
        TowerDefense.reset();
        UI.showScreen('towerdefense');
        TowerDefense.startGame();
      });
    }

    if (btnTdQuit) {
      btnTdQuit.addEventListener('click', () => {
        TowerDefense.reset();
        UI.showScreen('singleplayer');
      });
    }

    if (btnTdBack) {
      btnTdBack.addEventListener('click', () => {
        TowerDefense.exitGame();
      });
    }
  }

  init();
})();
