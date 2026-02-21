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

app.get('/config.js', (req, res) => {
  const host = req.get('host') || req.hostname || '';
  const isSbox = host.startsWith('sbox') || process.env.ADS_ENABLED === 'false';
  const adsEnabled = !isSbox;
  const platform = isSbox ? 'sbox' : 'web';
  console.log(`[config.js] host="${host}" hostname="${req.hostname}" x-forwarded-host="${req.get('x-forwarded-host')}" isSbox=${isSbox}`);
  res.type('application/javascript');
  res.send(`window.APP_CONFIG={adsEnabled:${adsEnabled},platform:"${platform}"};`);
});

app.use(express.static(path.join(__dirname, '..', 'public')));

setupAuthRoutes(app);

const io = new Server(server, {
  connectionStateRecovery: { maxDisconnectionDuration: 10000 }
});

setupSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`typeduel.io running on http://localhost:${PORT}`);
});
