require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { setupAuthRoutes } = require('./auth');
const { setupSocketHandlers } = require('./socket');

const PORT = process.env.PORT || 3000;

const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);

app.use(express.json());

app.get('/api/config', (req, res) => {
  const host = req.hostname || req.get('host') || '';
  const isSbox = host.startsWith('sbox') || process.env.ADS_ENABLED === 'false';
  const adsEnabled = !isSbox;
  const platform = isSbox ? 'sbox' : 'web';
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.type('application/javascript');
  res.send(`window.APP_CONFIG={adsEnabled:${adsEnabled},platform:"${platform}"};`);
});

app.use(express.static(path.join(__dirname, '..', 'public')));

setupAuthRoutes(app);

const io = new Server(server, {
  connectionStateRecovery: { maxDisconnectionDuration: 10000 }
});

setupSocketHandlers(io);

server.listen(PORT, async () => {
  console.log(`typeduel.io running on http://localhost:${PORT}`);

  const { supabase } = require('./db');
  const { data, error } = await supabase.from('profiles').select('id').limit(1);
  if (error) {
    console.error('\x1b[31m[STARTUP] Supabase connection FAILED:\x1b[0m', error.message);
    console.error('\x1b[31m  Hint: Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env\x1b[0m');
  } else {
    console.log('[STARTUP] Supabase connection OK');
  }
});
