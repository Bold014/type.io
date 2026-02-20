const { supabase, findUserById, findUserByUsername, updateEmail } = require('./db');

function setupAuthRoutes(app) {
  app.post('/api/check-username', async (req, res) => {
    try {
      const { username } = req.body;
      if (!username) return res.status(400).json({ error: 'Username required' });

      const profile = await findUserByUsername(username);
      res.json({ exists: !!profile });
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

      res.json(profile);
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
}

module.exports = { setupAuthRoutes };
