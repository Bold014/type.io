const {
  supabase, findUserById, findUserByUsername, checkUsernameExists, updateEmail,
  getLeaderboard, getMatchHistory, getUserAscendStats,
  saveTimeTrialRun, getTimeTrialLeaderboard, getUserTimeTrialStats, xpToLevel,
  getShopItems, getUserInventory, getUserEquipped,
  purchaseItem, equipItem, unequipItem,
  getUserDailyChallenges, updateChallengeProgress
} = require('./db');
const { pickSentencesForDuration } = require('./sentences');

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

  app.get('/api/me', async (req, res) => {
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

      const equipped = await getUserEquipped(user.id);
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
      if (charactersTyped) {
        updateChallengeProgress(user.id, 'type_chars', charactersTyped).catch(() => {});
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

  // --- SHOP ROUTES ---

  app.get('/api/shop', async (req, res) => {
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

      const challenges = await getUserDailyChallenges(user.id);
      res.json(challenges);
    } catch (err) {
      console.error('Challenges error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

module.exports = { setupAuthRoutes };
