require('dotenv').config();

// #region agent log
console.log('[DEBUG] ENV CHECK at startup:');
console.log('[DEBUG] SUPABASE_URL defined:', !!process.env.SUPABASE_URL);
console.log('[DEBUG] SUPABASE_URL value prefix:', process.env.SUPABASE_URL ? process.env.SUPABASE_URL.substring(0, 20) + '...' : 'UNDEFINED');
console.log('[DEBUG] SUPABASE_SERVICE_ROLE_KEY defined:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('[DEBUG] SUPABASE_ANON_KEY defined:', !!process.env.SUPABASE_ANON_KEY);
console.log('[DEBUG] PORT:', process.env.PORT);
console.log('[DEBUG] Total env var count:', Object.keys(process.env).length);
console.log('[DEBUG] All env var names:', Object.keys(process.env).filter(k => k.includes('SUPA') || k.includes('RAILWAY') || k.includes('PORT')).join(', '));
// #endregion

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { setupAuthRoutes } = require('./auth');
const { setupSocketHandlers } = require('./socket');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

setupAuthRoutes(app);

const io = new Server(server, {
  connectionStateRecovery: { maxDisconnectionDuration: 10000 }
});

setupSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`typeduel.io running on http://localhost:${PORT}`);
});
