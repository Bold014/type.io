const crypto = require('crypto');
const {
  supabase, findUserById, findUserByUsername, findUserBySteamId,
  updateProfileSteamId, updateProfileUsername, checkUsernameExists, updateEmail,
  getLeaderboard, getMatchHistory, getUserAscendStats,
  saveTimeTrialRun, getTimeTrialLeaderboard, getUserTimeTrialStats, xpToLevel,
  getShopItems, getUserInventory, getUserEquipped, getUserEquippedWithItems,
  purchaseItem, equipItem, unequipItem,
  getUserDailyChallenges, updateChallengeProgress,
  getUserWeeklyChallenges, updateWeeklyChallengeProgress,
  saveTowerDefenseRun, getTowerDefenseLeaderboard,
  upgradeCharValue, CHAR_VALUE_UPGRADES
} = require('./db');
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
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not logged in' });
      }

      const token = authHeader.slice(7);
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
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not logged in' });
      }

      const token = authHeader.slice(7);
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
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not logged in' });
      }

      const token = authHeader.slice(7);
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
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not logged in' });
      }

      const token = authHeader.slice(7);
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
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not logged in' });
      }

      const token = authHeader.slice(7);
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
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not logged in' });
      }

      const token = authHeader.slice(7);
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
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not logged in' });
      }

      const token = authHeader.slice(7);
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
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not logged in' });
      }

      const token = authHeader.slice(7);
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

      const authHeader = req.headers.authorization;
      let inventory = [];
      let equipped = [];
      let coins = 0;

      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
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
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not logged in' });
      }

      const token = authHeader.slice(7);
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
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not logged in' });
      }

      const token = authHeader.slice(7);
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
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not logged in' });
      }

      const token = authHeader.slice(7);
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

  // --- CHALLENGES ROUTE ---

  app.get('/api/challenges', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not logged in' });
      }

      const token = authHeader.slice(7);
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
