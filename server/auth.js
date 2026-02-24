const crypto = require('crypto');
const {
  supabase, supabaseDb, findUserById, findUserByUsername, findUserBySteamId,
  updateProfileSteamId, updateProfileUsername, checkUsernameExists, updateEmail,
  getLeaderboard, getMatchHistory, getUserAscendStats,
  saveTimeTrialRun, getTimeTrialLeaderboard, getUserTimeTrialStats, xpToLevel,
  getShopItems, getUserInventory, getUserEquipped, getUserEquippedWithItems,
  purchaseItem, equipItem, unequipItem,
  getUserDailyChallenges, updateChallengeProgress,
  getUserWeeklyChallenges, updateWeeklyChallengeProgress,
  saveTowerDefenseRun, getTowerDefenseLeaderboard,
  upgradeCharValue, CHAR_VALUE_UPGRADES, addCoins
} = require('./db');
const { getAllAchievements, getProfileStats, checkAchievements } = require('./achievements');
const { pickSentencesForDuration, getWordBank } = require('./sentences');

const FACEPUNCH_AUTH_URL = 'https://services.facepunch.com/sbox/auth/token';
const FACEPUNCH_PLAYER_URL = 'https://services.facepunch.com/sbox/player';

function deriveSteamPassword(steamId) {
  const secret = process.env.STEAM_AUTH_SECRET || 'default-dev-secret';
  return crypto.createHmac('sha256', secret).update(String(steamId)).digest('hex');
}

function sanitizeUsername(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'Player';
}

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return req.query.token || null;
}

function setupAuthRoutes(app) {
  app.post('/api/check-username', async (req, res) => {
    try {
      const { username } = req.body;
      if (!username) return res.status(400).json({ error: 'Username required' });

      const result = await checkUsernameExists(username);
      if (result.dbError) {
        return res.status(500).json({ error: 'Database connection error' });
      }
      res.json({ exists: result.exists });
    } catch (err) {
      console.error('Check username error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      const profile = await findUserByUsername(username);
      if (!profile || !profile.email) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password
      });

      if (error) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      res.json({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        profile
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/auth/steam', async (req, res) => {
    try {
      const { steamid, token } = req.body;
      if (!steamid || !token) {
        return res.status(400).json({ error: 'steamid and token required' });
      }

      const steamIdStr = String(steamid);
      console.log('[STEAM AUTH] Validating token for steamid:', steamIdStr);

      const validateBody = `{"steamid":${steamIdStr},"token":${JSON.stringify(token)}}`;

      const validateRes = await fetch(FACEPUNCH_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: validateBody
      });

      if (!validateRes.ok) {
        console.error('[STEAM AUTH] Facepunch validation HTTP error:', validateRes.status);
        return res.status(401).json({ error: 'Token validation failed' });
      }

      const responseText = await validateRes.text();
      const statusMatch = responseText.match(/"Status"\s*:\s*"([^"]+)"/);
      const steamIdMatch = responseText.match(/"SteamId"\s*:\s*(\d+)/);
      const status = statusMatch ? statusMatch[1] : null;
      const responseSteamId = steamIdMatch ? steamIdMatch[1] : null;

      console.log('[STEAM AUTH] Facepunch response - status:', status, 'steamid:', responseSteamId);

      if (status !== 'ok' || responseSteamId !== steamIdStr) {
        console.error('[STEAM AUTH] Token invalid. Status:', status, 'SteamId match:', responseSteamId === steamIdStr);
        return res.status(401).json({ error: 'Invalid token' });
      }

      console.log('[STEAM AUTH] Token validated successfully');

      let playerName = null;
      try {
        const playerRes = await fetch(`${FACEPUNCH_PLAYER_URL}/${steamIdStr}`);
        if (playerRes.ok) {
          const playerData = await playerRes.json();
          playerName = playerData.Name || null;
        }
      } catch (_) {}

      const email = `steam_${steamIdStr}@steam.typeduel.io`;
      const password = deriveSteamPassword(steamIdStr);

      let profile = await findUserBySteamId(steamIdStr);

      if (profile) {
        console.log('[STEAM AUTH] Found existing profile by steam_id:', profile.username, '| userId:', profile.id);
      }

      if (!profile) {
        let username = sanitizeUsername(playerName || 'Player');
        const existing = await checkUsernameExists(username);
        if (existing.exists) {
          username = username.slice(0, 14) + '_' + Math.floor(Math.random() * 99999);
        }

        console.log('[STEAM AUTH] No profile with steam_id, creating user with email:', email, '| username:', username);

        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { username }
        });

        if (createError) {
          if (createError.message?.includes('already been registered')) {
            console.log('[STEAM AUTH] Email already registered, signing in existing account');
            const signIn = await supabase.auth.signInWithPassword({ email, password });
            if (signIn.error) {
              console.error('[STEAM AUTH] Sign-in failed for existing email:', signIn.error.message);
              return res.status(500).json({ error: 'Steam account exists but sign-in failed' });
            }

            const existingProfile = await findUserById(signIn.data.user.id);
            console.log('[STEAM AUTH] Existing profile:', existingProfile?.username, '| userId:', existingProfile?.id, '| current steam_id:', existingProfile?.steam_id || 'none');

            if (existingProfile && !existingProfile.steam_id) {
              const linked = await updateProfileSteamId(signIn.data.user.id, steamIdStr);
              if (!linked) {
                console.error('[STEAM AUTH] Failed to link steam_id for existing user:', signIn.data.user.id);
              } else {
                console.log('[STEAM AUTH] Successfully linked steam_id for existing user:', signIn.data.user.id);
              }
            }

            profile = await findUserById(signIn.data.user.id);
            if (!profile) {
              return res.status(500).json({ error: 'Profile not found' });
            }

            console.log('[STEAM AUTH] Returning existing profile | username:', profile.username, '| steam_id:', profile.steam_id || 'none');
            const equipped = await getUserEquippedWithItems(profile.id);
            return res.json({
              access_token: signIn.data.session.access_token,
              refresh_token: signIn.data.session.refresh_token,
              profile: { ...profile, equipped }
            });
          }
          console.error('[STEAM AUTH] createUser error:', createError);
          return res.status(500).json({ error: 'Failed to create account' });
        }

        console.log('[STEAM AUTH] New auth user created:', newUser.user.id, '| waiting for profile...');

        for (let i = 0; i < 10; i++) {
          profile = await findUserById(newUser.user.id);
          if (profile) break;
          await new Promise(r => setTimeout(r, 300));
        }

        if (!profile) {
          return res.status(500).json({ error: 'Profile creation timed out' });
        }

        console.log('[STEAM AUTH] Profile found after', 'polling | username:', profile.username, '| saving steam_id...');

        let steamIdSaved = await updateProfileSteamId(newUser.user.id, steamIdStr);
        if (!steamIdSaved) {
          console.error('[STEAM AUTH] First steam_id save failed for new user, retrying after delay...');
          await new Promise(r => setTimeout(r, 1000));
          steamIdSaved = await updateProfileSteamId(newUser.user.id, steamIdStr);
          if (!steamIdSaved) {
            console.error('[STEAM AUTH] Steam ID save FAILED after retry for user:', newUser.user.id, 'steamId:', steamIdStr);
          }
        }
        if (playerName) {
          const sanitized = sanitizeUsername(playerName);
          if (sanitized && sanitized !== profile.username) {
            const taken = await checkUsernameExists(sanitized);
            if (!taken.exists) {
              await updateProfileUsername(newUser.user.id, sanitized);
              profile.username = sanitized;
            }
          }
        }
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        console.error('[STEAM AUTH] Final sign-in failed:', signInError.message);
        return res.status(500).json({ error: 'Authentication failed' });
      }

      profile = await findUserById(signInData.user.id);
      const equipped = await getUserEquippedWithItems(profile.id);

      console.log('[STEAM AUTH] Auth complete | username:', profile.username, '| steam_id:', profile.steam_id || 'MISSING');

      res.json({
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
        profile: { ...profile, equipped }
      });
    } catch (err) {
      console.error('Steam auth error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/me', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Not logged in' });
      }
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const profile = await findUserById(user.id);
      if (!profile) {
        return res.status(401).json({ error: 'Profile not found' });
      }

      const equipped = await getUserEquippedWithItems(user.id);
      res.json({ ...profile, equipped });
    } catch (err) {
      console.error('Auth error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/update-email', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Not logged in' });
      }
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { email } = req.body;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, { email });
      if (updateError) {
        let msg = updateError.message;
        if (msg.includes('already been registered') || msg.includes('Error updating user')) {
          msg = 'That email is already associated with another account';
        }
        return res.status(400).json({ error: msg });
      }

      await updateEmail(user.id, email);

      res.json({ success: true });
    } catch (err) {
      console.error('Update email error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/leaderboard', async (req, res) => {
    try {
      const category = req.query.category || 'rating';
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);

      if (category === 'time_trial') {
        const duration = parseInt(req.query.duration) || 60;
        const data = await getTimeTrialLeaderboard(duration, limit);
        res.set('Cache-Control', 'no-store');
        return res.json(data);
      }

      if (category === 'tower_defense') {
        const data = await getTowerDefenseLeaderboard(limit);
        res.set('Cache-Control', 'no-store');
        return res.json(data);
      }

      const data = await getLeaderboard(category, limit);
      res.set('Cache-Control', 'no-store');
      res.json(data);
    } catch (err) {
      console.error('Leaderboard error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/match-history', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Not logged in' });
      }
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const limit = Math.min(parseInt(req.query.limit) || 10, 50);
      const history = await getMatchHistory(user.id, limit);
      res.json(history);
    } catch (err) {
      console.error('Match history error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/ascend-stats', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Not logged in' });
      }
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const stats = await getUserAscendStats(user.id);
      res.json(stats);
    } catch (err) {
      console.error('Ascend stats error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/time-trial/sentences', (req, res) => {
    try {
      const duration = parseInt(req.query.duration) || 60;
      const validDurations = [15, 30, 60, 120];
      const d = validDurations.includes(duration) ? duration : 60;
      const result = pickSentencesForDuration(d);
      res.json(result);
    } catch (err) {
      console.error('Time trial sentences error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/time-trial/result', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Not logged in' });
      }
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const profile = await findUserById(user.id);
      if (!profile) {
        return res.status(401).json({ error: 'Profile not found' });
      }

      const { duration, wpm, accuracy, charactersTyped, correctCharacters, errors } = req.body;
      if (!duration || !wpm) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const xpResult = await saveTimeTrialRun(user.id, profile.username, {
        duration, wpm, accuracy, charactersTyped, correctCharacters, errors
      });

      updateChallengeProgress(user.id, 'complete_timetrials', 1).catch(() => {});
      updateWeeklyChallengeProgress(user.id, 'complete_timetrials', 1).catch(() => {});
      if (charactersTyped) {
        updateChallengeProgress(user.id, 'type_chars', charactersTyped).catch(() => {});
        updateWeeklyChallengeProgress(user.id, 'type_chars', charactersTyped).catch(() => {});
      }

      res.json({ success: true, xp: xpResult });
    } catch (err) {
      console.error('Time trial result error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/time-trial-stats', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Not logged in' });
      }
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const stats = await getUserTimeTrialStats(user.id);
      res.json(stats);
    } catch (err) {
      console.error('Time trial stats error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // --- ZEN MODE RESULT ---

  app.post('/api/zen/result', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Not logged in' });
      }
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const profile = await findUserById(user.id);
      if (!profile) {
        return res.status(401).json({ error: 'Profile not found' });
      }

      const { charactersTyped } = req.body;
      if (!charactersTyped || charactersTyped <= 0) {
        return res.json({ success: true, coinsGained: 0 });
      }

      const { computeMoneyFromChars } = require('./db');
      const charLevel = profile.char_value_level || 0;
      const coinsGained = computeMoneyFromChars(charactersTyped, charLevel);
      const newCoins = (profile.coins || 0) + coinsGained;
      const newTotalChars = (profile.total_chars_typed || 0) + charactersTyped;

      const { supabaseDb } = require('./db');
      await supabaseDb.from('profiles').update({
        coins: newCoins,
        total_chars_typed: newTotalChars
      }).eq('id', user.id);

      if (charactersTyped) {
        updateChallengeProgress(user.id, 'type_chars', charactersTyped).catch(() => {});
        updateWeeklyChallengeProgress(user.id, 'type_chars', charactersTyped).catch(() => {});
      }

      res.json({
        success: true,
        coinsGained,
        newCoins,
        newTotalChars,
        charValue: (CHAR_VALUE_UPGRADES[charLevel] || CHAR_VALUE_UPGRADES[0]).value,
        charsTyped: charactersTyped
      });
    } catch (err) {
      console.error('Zen result error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // --- TOWER DEFENSE ROUTES ---

  app.get('/api/tower-defense/words', (req, res) => {
    try {
      const bank = getWordBank();
      res.json(bank);
    } catch (err) {
      console.error('Tower defense words error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/tower-defense/result', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Not logged in' });
      }
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const profile = await findUserById(user.id);
      if (!profile) {
        return res.status(401).json({ error: 'Profile not found' });
      }

      const { wavesSurvived, enemiesKilled, score, accuracy, durationMs, charsTyped } = req.body;
      if (wavesSurvived == null || score == null) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const xpResult = await saveTowerDefenseRun(user.id, profile.username, {
        wavesSurvived, enemiesKilled, score, accuracy, durationMs, charsTyped: charsTyped || 0
      });

      updateChallengeProgress(user.id, 'complete_towerdefense', 1).catch(() => {});
      updateWeeklyChallengeProgress(user.id, 'complete_towerdefense', 1).catch(() => {});

      res.json({ success: true, xp: xpResult });
    } catch (err) {
      console.error('Tower defense result error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // --- UPGRADE ROUTES ---

  app.post('/api/upgrade/char-value', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Not logged in' });
      }
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const result = await upgradeCharValue(user.id);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      const newLevel = result.newLevel;
      const upgrade = CHAR_VALUE_UPGRADES[newLevel] || CHAR_VALUE_UPGRADES[0];
      const nextUpgrade = CHAR_VALUE_UPGRADES[newLevel + 1] || null;

      res.json({
        success: true,
        newLevel,
        newBalance: result.newBalance,
        charValue: upgrade.value,
        nextCost: nextUpgrade ? nextUpgrade.cost : null
      });
    } catch (err) {
      console.error('Upgrade char value error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // --- SHOP ROUTES ---

  app.get('/api/shop', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const items = await getShopItems();

      let inventory = [];
      let equipped = [];
      let coins = 0;
      const optToken = extractToken(req);
      if (optToken) {
        const token = optToken;
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user) {
          const profile = await findUserById(user.id);
          coins = profile?.coins || 0;
          [inventory, equipped] = await Promise.all([
            getUserInventory(user.id),
            getUserEquipped(user.id)
          ]);
        }
      }

      res.json({ items, inventory, equipped, coins });
    } catch (err) {
      console.error('Shop error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/shop/purchase', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Not logged in' });
      }
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { itemId } = req.body;
      if (!itemId) {
        return res.status(400).json({ error: 'Item ID required' });
      }

      const result = await purchaseItem(user.id, itemId);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, newBalance: result.newBalance });
    } catch (err) {
      console.error('Purchase error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/shop/equip', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Not logged in' });
      }
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { itemId, category } = req.body;
      if (!itemId || !category) {
        return res.status(400).json({ error: 'Item ID and category required' });
      }

      const ok = await equipItem(user.id, itemId, category);
      if (!ok) {
        return res.status(500).json({ error: 'Failed to equip' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Equip error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/shop/unequip', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Not logged in' });
      }
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { category } = req.body;
      if (!category) {
        return res.status(400).json({ error: 'Category required' });
      }

      const ok = await unequipItem(user.id, category);
      if (!ok) {
        return res.status(500).json({ error: 'Failed to unequip' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Unequip error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // --- FRIENDS ROUTES ---

  app.get('/api/friends', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) return res.status(401).json({ error: 'Not logged in' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });

      const { data: friends } = await supabaseDb.from('friendships')
        .select('friend_id, profiles!friendships_friend_id_fkey(username)')
        .eq('user_id', user.id).eq('status', 'accepted');

      const { data: friends2 } = await supabaseDb.from('friendships')
        .select('user_id, profiles!friendships_user_id_fkey(username)')
        .eq('friend_id', user.id).eq('status', 'accepted');

      const { data: requests } = await supabaseDb.from('friendships')
        .select('user_id, profiles!friendships_user_id_fkey(username)')
        .eq('friend_id', user.id).eq('status', 'pending');

      const friendList = [
        ...((friends || []).map(f => ({ id: f.friend_id, username: f.profiles?.username || 'Unknown', online: false }))),
        ...((friends2 || []).map(f => ({ id: f.user_id, username: f.profiles?.username || 'Unknown', online: false })))
      ];

      const requestList = (requests || []).map(r => ({ id: r.user_id, username: r.profiles?.username || 'Unknown' }));

      res.json({ friends: friendList, requests: requestList });
    } catch (err) { console.error('Friends error:', err); res.status(500).json({ error: 'Internal server error' }); }
  });

  app.post('/api/friends/request', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) return res.status(401).json({ error: 'Not logged in' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });

      const { username } = req.body;
      if (!username) return res.status(400).json({ error: 'Username required' });

      const target = await findUserByUsername(username);
      if (!target) return res.status(404).json({ error: 'User not found' });
      if (target.id === user.id) return res.status(400).json({ error: 'Cannot add yourself' });

      const { data: existing } = await supabaseDb.from('friendships')
        .select('id').or(`and(user_id.eq.${user.id},friend_id.eq.${target.id}),and(user_id.eq.${target.id},friend_id.eq.${user.id})`).limit(1);
      if (existing && existing.length > 0) return res.status(400).json({ error: 'Request already exists' });

      await supabaseDb.from('friendships').insert({ user_id: user.id, friend_id: target.id, status: 'pending' });
      res.json({ success: true });
    } catch (err) { console.error('Friend request error:', err); res.status(500).json({ error: 'Internal server error' }); }
  });

  app.post('/api/friends/accept', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) return res.status(401).json({ error: 'Not logged in' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });

      const { friendId } = req.body;
      await supabaseDb.from('friendships').update({ status: 'accepted' })
        .eq('user_id', friendId).eq('friend_id', user.id).eq('status', 'pending');
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
  });

  app.post('/api/friends/decline', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) return res.status(401).json({ error: 'Not logged in' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });

      const { friendId } = req.body;
      await supabaseDb.from('friendships').delete()
        .eq('user_id', friendId).eq('friend_id', user.id).eq('status', 'pending');
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
  });

  app.post('/api/friends/remove', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) return res.status(401).json({ error: 'Not logged in' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });

      const { friendId } = req.body;
      await supabaseDb.from('friendships').delete()
        .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
  });

  // --- ACHIEVEMENTS ROUTE ---

  app.get('/api/achievements', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) return res.status(401).json({ error: 'Not logged in' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });

      const profile = await findUserById(user.id);
      if (!profile) return res.status(401).json({ error: 'Profile not found' });

      const { data: userAchievements } = await supabaseDb.from('user_achievements')
        .select('achievement_id, unlocked_at').eq('user_id', user.id);

      const existingIds = new Set((userAchievements || []).map(a => a.achievement_id));
      const stats = getProfileStats(profile);
      const newlyUnlocked = checkAchievements(stats, existingIds);

      if (newlyUnlocked.length > 0) {
        const rows = newlyUnlocked.map(a => ({ user_id: user.id, achievement_id: a.id, unlocked_at: new Date().toISOString() }));
        await supabaseDb.from('user_achievements').insert(rows);
      }

      const all = getAllAchievements();
      const updatedUserAchievements = [...(userAchievements || []), ...newlyUnlocked.map(a => ({ achievement_id: a.id }))];
      res.json({ all, user: updatedUserAchievements, newlyUnlocked: newlyUnlocked.map(a => ({ id: a.id, name: a.name })) });
    } catch (err) { console.error('Achievements error:', err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // --- ANALYTICS ROUTE ---

  app.get('/api/analytics', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) return res.status(401).json({ error: 'Not logged in' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const today = new Date().toISOString().slice(0, 10);

      const { data: matches } = await supabaseDb.from('match_history')
        .select('user_wpm, created_at, won').eq('user_id', user.id)
        .gte('created_at', thirtyDaysAgo).order('created_at');

      const { data: ttRuns } = await supabaseDb.from('time_trial_runs')
        .select('wpm, accuracy, created_at').eq('user_id', user.id)
        .gte('created_at', thirtyDaysAgo).order('created_at');

      const allWpms = [
        ...((matches || []).map(m => ({ wpm: Number(m.user_wpm), date: m.created_at }))),
        ...((ttRuns || []).map(r => ({ wpm: Number(r.wpm), date: r.created_at })))
      ].sort((a, b) => new Date(a.date) - new Date(b.date));

      const totalGames = allWpms.length;
      const avgWpm = totalGames > 0 ? Math.round(allWpms.reduce((s, w) => s + w.wpm, 0) / totalGames) : 0;
      const bestWpm = totalGames > 0 ? Math.round(Math.max(...allWpms.map(w => w.wpm))) : 0;

      const accuracies = (ttRuns || []).map(r => Number(r.accuracy));
      const avgAccuracy = accuracies.length > 0 ? Math.round(accuracies.reduce((s, a) => s + a, 0) / accuracies.length) : 0;

      const todayMatches = allWpms.filter(w => w.date.startsWith(today));
      const todayGames = todayMatches.length;
      const todayAvgWpm = todayGames > 0 ? Math.round(todayMatches.reduce((s, w) => s + w.wpm, 0) / todayGames) : 0;

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const weekMatches = allWpms.filter(w => w.date >= weekAgo);
      const weekAvgWpm = weekMatches.length > 0 ? Math.round(weekMatches.reduce((s, w) => s + w.wpm, 0) / weekMatches.length) : 0;

      const wpmHistory = [];
      const dayMap = {};
      for (const w of allWpms) {
        const day = w.date.slice(0, 10);
        if (!dayMap[day]) dayMap[day] = [];
        dayMap[day].push(w.wpm);
      }
      for (const [day, wpms] of Object.entries(dayMap)) {
        wpmHistory.push({ date: day, wpm: Math.round(wpms.reduce((s, w) => s + w, 0) / wpms.length) });
      }

      res.json({ avgWpm, bestWpm, totalGames, avgAccuracy, todayGames, todayAvgWpm, weekAvgWpm, wpmHistory });
    } catch (err) { console.error('Analytics error:', err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // --- LOGIN STREAK ROUTE ---

  app.post('/api/login-streak', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) return res.status(401).json({ error: 'Not logged in' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });

      const { data: profile } = await supabaseDb.from('profiles')
        .select('login_streak, last_login_date, longest_streak').eq('id', user.id).single();

      if (!profile) return res.json({ streak: 0, reward: 0 });

      const today = new Date().toISOString().slice(0, 10);
      const lastLogin = profile.last_login_date;

      if (lastLogin === today) return res.json({ streak: profile.login_streak || 1, reward: 0, alreadyLoggedIn: true });

      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      let newStreak;
      if (lastLogin === yesterday) {
        newStreak = (profile.login_streak || 0) + 1;
      } else {
        newStreak = 1;
      }

      const longestStreak = Math.max(newStreak, profile.longest_streak || 0);

      const STREAK_REWARDS = { 1: 50, 2: 75, 3: 100, 7: 250, 14: 500, 30: 1000 };
      let reward = STREAK_REWARDS[newStreak] || (newStreak > 1 ? 50 : 25);

      await supabaseDb.from('profiles').update({
        login_streak: newStreak,
        last_login_date: today,
        longest_streak: longestStreak
      }).eq('id', user.id);

      if (reward > 0) await addCoins(user.id, reward);

      res.json({ streak: newStreak, reward, longestStreak });
    } catch (err) { console.error('Login streak error:', err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // --- CLAN ROUTES ---

  app.get('/api/clan', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) return res.status(401).json({ error: 'Not logged in' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });

      const { data: membership } = await supabaseDb.from('clan_members')
        .select('clan_id, role').eq('user_id', user.id).single();

      if (!membership) return res.status(404).json({ error: 'Not in a clan' });

      const { data: clan } = await supabaseDb.from('clans')
        .select('*').eq('id', membership.clan_id).single();

      const { data: members } = await supabaseDb.from('clan_members')
        .select('user_id, role, profiles(username)').eq('clan_id', membership.clan_id);

      const memberList = (members || []).map(m => ({
        userId: m.user_id,
        username: m.profiles?.username || 'Unknown',
        role: m.role
      }));

      res.json({ clan, members: memberList });
    } catch (err) { console.error('Clan error:', err); res.status(500).json({ error: 'Internal server error' }); }
  });

  app.post('/api/clan/create', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) return res.status(401).json({ error: 'Not logged in' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });

      const { name } = req.body;
      if (!name || name.length < 2 || name.length > 20) return res.status(400).json({ error: 'Name must be 2-20 characters' });

      const { data: existing } = await supabaseDb.from('clan_members').select('id').eq('user_id', user.id).limit(1);
      if (existing && existing.length > 0) return res.status(400).json({ error: 'Already in a clan' });

      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { data: clan, error: createErr } = await supabaseDb.from('clans')
        .insert({ name, code, owner_id: user.id, created_at: new Date().toISOString() }).select().single();
      if (createErr) return res.status(500).json({ error: 'Failed to create clan' });

      await supabaseDb.from('clan_members').insert({ clan_id: clan.id, user_id: user.id, role: 'owner' });
      res.json({ success: true, clan });
    } catch (err) { console.error('Create clan error:', err); res.status(500).json({ error: 'Internal server error' }); }
  });

  app.post('/api/clan/join', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) return res.status(401).json({ error: 'Not logged in' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });

      const { code } = req.body;
      if (!code) return res.status(400).json({ error: 'Code required' });

      const { data: existing } = await supabaseDb.from('clan_members').select('id').eq('user_id', user.id).limit(1);
      if (existing && existing.length > 0) return res.status(400).json({ error: 'Already in a clan' });

      const { data: clan } = await supabaseDb.from('clans').select('*').ilike('code', code).single();
      if (!clan) return res.status(404).json({ error: 'Clan not found' });

      const { data: members } = await supabaseDb.from('clan_members').select('id').eq('clan_id', clan.id);
      if ((members || []).length >= 50) return res.status(400).json({ error: 'Clan is full' });

      await supabaseDb.from('clan_members').insert({ clan_id: clan.id, user_id: user.id, role: 'member' });
      res.json({ success: true });
    } catch (err) { console.error('Join clan error:', err); res.status(500).json({ error: 'Internal server error' }); }
  });

  app.post('/api/clan/leave', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) return res.status(401).json({ error: 'Not logged in' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });

      await supabaseDb.from('clan_members').delete().eq('user_id', user.id);
      res.json({ success: true });
    } catch (err) { console.error('Leave clan error:', err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // --- REPLAY ROUTES ---

  app.post('/api/replay/save', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) return res.status(401).json({ error: 'Not logged in' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });

      const { matchId, sentence, keystrokes, wpm, durationMs } = req.body;
      if (!sentence || !keystrokes) return res.status(400).json({ error: 'Missing data' });

      const { error: insertErr } = await supabaseDb.from('match_replays').insert({
        match_id: matchId || null,
        user_id: user.id,
        sentence,
        keystrokes,
        wpm: wpm || 0,
        duration_ms: durationMs || 0,
        created_at: new Date().toISOString()
      });

      if (insertErr) return res.status(500).json({ error: 'Failed to save replay' });
      res.json({ success: true });
    } catch (err) { console.error('Replay save error:', err); res.status(500).json({ error: 'Internal server error' }); }
  });

  app.get('/api/replays', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) return res.status(401).json({ error: 'Not logged in' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });

      const { data: replays } = await supabaseDb.from('match_replays')
        .select('id, sentence, wpm, duration_ms, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      res.json(replays || []);
    } catch (err) { console.error('Replays list error:', err); res.status(500).json({ error: 'Internal server error' }); }
  });

  app.get('/api/replay/:id', async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) return res.status(401).json({ error: 'Not logged in' });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });

      const { data: replay } = await supabaseDb.from('match_replays')
        .select('*').eq('id', req.params.id).eq('user_id', user.id).single();

      if (!replay) return res.status(404).json({ error: 'Replay not found' });
      res.json(replay);
    } catch (err) { console.error('Replay get error:', err); res.status(500).json({ error: 'Internal server error' }); }
  });

  // --- CHALLENGES ROUTE ---

  app.get('/api/challenges', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Not logged in' });
      }
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const [daily, weekly] = await Promise.all([
        getUserDailyChallenges(user.id),
        getUserWeeklyChallenges(user.id)
      ]);
      res.json({ daily, weekly });
    } catch (err) {
      console.error('Challenges error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

module.exports = { setupAuthRoutes };
