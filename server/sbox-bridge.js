const WebSocket = require('ws');
const matchmaking = require('./matchmaking');
const {
  createGame, startCountdown, handleTypingUpdate,
  handleRoundComplete, handleDisconnect, getGameBySocketId
} = require('./game');

const sboxClients = new Map();
const roomMembers = new Map();

class SboxSocketAdapter {
  constructor(ws) {
    this._ws = ws;
    this.id = `sbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.data = { userId: null, username: null, rating: 1000 };
    this._rooms = new Set();
    this.connected = true;
  }

  emit(event, data) {
    if (this._ws.readyState !== WebSocket.OPEN) return;
    try {
      this._ws.send(JSON.stringify({ type: event, data }));
    } catch (_) {}
  }

  join(room) {
    this._rooms.add(room);
    if (!roomMembers.has(room)) roomMembers.set(room, new Set());
    roomMembers.get(room).add(this.id);
  }

  leave(room) {
    this._rooms.delete(room);
    if (roomMembers.has(room)) {
      roomMembers.get(room).delete(this.id);
      if (roomMembers.get(room).size === 0) roomMembers.delete(room);
    }
  }

  leaveAll() {
    for (const room of this._rooms) {
      this.leave(room);
    }
  }

  disconnect() {
    this.connected = false;
    this.leaveAll();
    try { this._ws.close(); } catch (_) {}
  }
}

function broadcastToSboxRoom(room, event, data) {
  if (!roomMembers.has(room)) return;
  for (const clientId of roomMembers.get(room)) {
    const adapter = sboxClients.get(clientId);
    if (adapter && adapter.connected) {
      adapter.emit(event, data);
    }
  }
}

function patchIoBroadcast(io) {
  const originalTo = io.to.bind(io);

  io.to = function (room) {
    const chain = originalTo(room);
    const originalEmit = chain.emit.bind(chain);

    chain.emit = function (event, data) {
      originalEmit(event, data);
      broadcastToSboxRoom(room, event, data);
    };

    return chain;
  };
}

let roomCounter = 0;

function createMatch(io, player1, player2, mode) {
  roomCounter++;
  const roomId = `room_${roomCounter}_${Date.now()}`;

  player1.socket.join(roomId);
  player2.socket.join(roomId);

  const game = createGame(roomId, player1, player2, mode);

  player1.socket.emit('match:found', {
    opponent: player2.username,
    opponentRating: mode === 'ranked' ? player2.rating : null,
    roomId
  });
  player2.socket.emit('match:found', {
    opponent: player1.username,
    opponentRating: mode === 'ranked' ? player1.rating : null,
    roomId
  });

  setTimeout(() => startCountdown(io, game), 4000);
}

function setupSboxWebSocket(server, io) {
  patchIoBroadcast(io);

  const wss = new WebSocket.Server({ server, path: '/sbox' });

  wss.on('connection', (ws) => {
    const adapter = new SboxSocketAdapter(ws);
    sboxClients.set(adapter.id, adapter);
    console.log(`S&Box client connected: ${adapter.id}`);

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (e) {
        console.error('S&Box: bad message', e);
        return;
      }

      const { type, data } = msg;

      switch (type) {
        case 'auth:set':
          adapter.data.username = data?.username;
          adapter.data.userId = data?.userId || null;
          adapter.data.rating = data?.rating || 1000;
          break;

        case 'queue:join': {
          if (!adapter.data.username) {
            adapter.emit('error:message', { message: 'Set a username first' });
            return;
          }

          const mode = data?.mode === 'ranked' ? 'ranked' : 'quick';
          if (mode === 'ranked' && !adapter.data.userId) {
            adapter.emit('error:message', { message: 'Must be logged in for ranked' });
            return;
          }

          const entry = {
            socket: adapter,
            username: adapter.data.username,
            userId: adapter.data.userId,
            rating: adapter.data.rating || 1000
          };

          const match = matchmaking.addToQueue(adapter, mode);
          if (match) {
            createMatch(io, match[0], match[1], mode);
          } else {
            adapter.emit('queue:waiting', { mode, position: matchmaking.getQueueSize(mode) });
          }
          break;
        }

        case 'queue:leave':
          matchmaking.removeFromQueue(adapter.id);
          break;

        case 'typing:update': {
          const game = getGameBySocketId(adapter.id);
          if (game) handleTypingUpdate(io, game, adapter.id, data);
          break;
        }

        case 'round:complete': {
          const game = getGameBySocketId(adapter.id);
          if (game) handleRoundComplete(io, game, adapter.id, data);
          break;
        }

        default:
          break;
      }
    });

    ws.on('close', () => {
      console.log(`S&Box client disconnected: ${adapter.id}`);
      adapter.connected = false;
      matchmaking.removeFromQueue(adapter.id);
      handleDisconnect(io, adapter.id);
      adapter.leaveAll();
      sboxClients.delete(adapter.id);
    });

    ws.on('error', (err) => {
      console.error(`S&Box client error (${adapter.id}):`, err.message);
    });
  });

  console.log('S&Box WebSocket bridge ready on /sbox');
}

module.exports = { setupSboxWebSocket, sboxClients, broadcastToSboxRoom };
