const BOT_TIMER_MS = 1000;

class Matchmaking {
  constructor() {
    this.quickQueue = [];
    this.rankedQueue = [];
    this.botTimers = new Map();
    this._onBotMatch = null;
  }

  setOnBotMatch(callback) {
    this._onBotMatch = callback;
  }

  addToQueue(socket, mode) {
    const queue = mode === 'ranked' ? this.rankedQueue : this.quickQueue;
    if (queue.find(p => p.socket.id === socket.id)) return null;
    const entry = {
      socket,
      username: socket.data.username,
      userId: socket.data.userId,
      rating: socket.data.rating || 1000,
      joinedAt: Date.now()
    };
    queue.push(entry);
    const match = this.tryMatch(mode);

    if (match) {
      this._cancelBotTimer(match[0].socket.id);
      this._cancelBotTimer(match[1].socket.id);
      return match;
    }

    if (mode === 'quick' && this._onBotMatch) {
      this._startBotTimer(socket.id);
    }

    return null;
  }

  removeFromQueue(socketId) {
    this._cancelBotTimer(socketId);
    this.quickQueue = this.quickQueue.filter(p => p.socket.id !== socketId);
    this.rankedQueue = this.rankedQueue.filter(p => p.socket.id !== socketId);
  }

  tryMatch(mode) {
    const queue = mode === 'ranked' ? this.rankedQueue : this.quickQueue;

    if (mode === 'quick' && queue.length >= 2) {
      const p1 = queue.shift();
      const p2 = queue.shift();
      this._cancelBotTimer(p1.socket.id);
      this._cancelBotTimer(p2.socket.id);
      return [p1, p2];
    }

    if (mode === 'ranked' && queue.length >= 2) {
      for (let i = 0; i < queue.length; i++) {
        for (let j = i + 1; j < queue.length; j++) {
          const ratingDiff = Math.abs(queue[i].rating - queue[j].rating);
          const waitTime = Math.min(Date.now() - queue[i].joinedAt, Date.now() - queue[j].joinedAt);
          const allowedDiff = 200 + Math.floor(waitTime / 10000) * 100;

          if (ratingDiff <= allowedDiff) {
            const p2 = queue.splice(j, 1)[0];
            const p1 = queue.splice(i, 1)[0];
            return [p1, p2];
          }
        }
      }
    }

    return null;
  }

  _startBotTimer(socketId) {
    this._cancelBotTimer(socketId);
    const timer = setTimeout(() => {
      this.botTimers.delete(socketId);
      const idx = this.quickQueue.findIndex(p => p.socket.id === socketId);
      if (idx === -1) return;
      const player = this.quickQueue.splice(idx, 1)[0];
      if (this._onBotMatch) {
        this._onBotMatch(player);
      }
    }, BOT_TIMER_MS);
    this.botTimers.set(socketId, timer);
  }

  _cancelBotTimer(socketId) {
    const timer = this.botTimers.get(socketId);
    if (timer) {
      clearTimeout(timer);
      this.botTimers.delete(socketId);
    }
  }

  getQueueSize(mode) {
    return mode === 'ranked' ? this.rankedQueue.length : this.quickQueue.length;
  }
}

module.exports = new Matchmaking();
