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
  const host = req.hostname || req.get('host') || '';
  const isSbox = host.startsWith('sbox') || process.env.ADS_ENABLED === 'false';
  const adsEnabled = !isSbox;
  const platform = isSbox ? 'sbox' : 'web';
  // #region agent log
  const _dbg = {hostname:req.hostname,hostHeader:req.get('host'),xFwdHost:req.get('x-forwarded-host'),adsEnv:process.env.ADS_ENABLED,isSbox,adsEnabled};
  // #endregion
  res.set('Cache-Control', 'no-store');
  res.type('application/javascript');
  res.send(`window.APP_CONFIG={adsEnabled:${adsEnabled},platform:"${platform}",host:"${host}"};/*DBG:${JSON.stringify(_dbg)}*/`);
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
