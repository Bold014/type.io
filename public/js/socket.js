const GameSocket = (() => {
  const socket = io({ autoConnect: true });
  const listeners = {};

  function on(event, callback) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
    socket.on(event, callback);
  }

  function off(event, callback) {
    socket.off(event, callback);
    if (listeners[event]) {
      listeners[event] = listeners[event].filter(cb => cb !== callback);
    }
  }

  function emit(event, data) {
    socket.emit(event, data);
  }

  function setAuth(data) {
    socket.emit('auth:set', data);
  }

  function joinQueue(mode) {
    socket.emit('queue:join', { mode });
  }

  function leaveQueue() {
    socket.emit('queue:leave');
  }

  function sendTypingUpdate(data) {
    socket.emit('typing:update', data);
  }

  function sendRoundComplete(data) {
    socket.emit('round:complete', data);
  }

  return { socket, on, off, emit, setAuth, joinQueue, leaveQueue, sendTypingUpdate, sendRoundComplete };
})();
