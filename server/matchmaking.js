class Matchmaking {
  constructor() {
    this.quickQueue = [];
    this.rankedQueue = [];
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
    return this.tryMatch(mode);
  }

  removeFromQueue(socketId) {
    this.quickQueue = this.quickQueue.filter(p => p.socket.id !== socketId);
    this.rankedQueue = this.rankedQueue.filter(p => p.socket.id !== socketId);
  }

  tryMatch(mode) {
    const queue = mode === 'ranked' ? this.rankedQueue : this.quickQueue;

    if (mode === 'quick' && queue.length >= 2) {
      const p1 = queue.shift();
      const p2 = queue.shift();
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

  getQueueSize(mode) {
    return mode === 'ranked' ? this.rankedQueue.length : this.quickQueue.length;
  }
}

module.exports = new Matchmaking();
