const AudioManager = (() => {
  let ctx = null;
  let sfxEnabled = true;
  let volume = 0.3;

  function getContext() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
    }
    return ctx;
  }

  function resumeContext() {
    const c = getContext();
    if (c && c.state === 'suspended') c.resume();
  }

  function playTone(freq, duration, type, vol) {
    const c = getContext();
    if (!c || !sfxEnabled) return;
    resumeContext();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.value = (vol || volume) * volume;
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + duration);
  }

  function playNoise(duration, vol) {
    const c = getContext();
    if (!c || !sfxEnabled) return;
    resumeContext();
    const bufferSize = c.sampleRate * duration;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.15;
    }
    const source = c.createBufferSource();
    source.buffer = buffer;
    const gain = c.createGain();
    gain.gain.value = (vol || 0.05) * volume;
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    source.connect(gain);
    gain.connect(c.destination);
    source.start();
  }

  function keypress() {
    playNoise(0.04, 0.08);
  }

  function countdownBeep() {
    playTone(660, 0.15, 'sine', 0.4);
  }

  function countdownGo() {
    playTone(880, 0.25, 'sine', 0.5);
  }

  function roundWin() {
    const c = getContext();
    if (!c || !sfxEnabled) return;
    resumeContext();
    [523, 659, 784].forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.3, 'sine', 0.35), i * 120);
    });
  }

  function roundLose() {
    const c = getContext();
    if (!c || !sfxEnabled) return;
    resumeContext();
    [400, 350, 300].forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.3, 'sine', 0.3), i * 150);
    });
  }

  function attackReceived() {
    playTone(200, 0.2, 'sawtooth', 0.25);
  }

  function attackSent() {
    playTone(800, 0.15, 'square', 0.15);
  }

  function levelUp() {
    const c = getContext();
    if (!c || !sfxEnabled) return;
    resumeContext();
    [523, 659, 784, 1047].forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.4, 'sine', 0.3), i * 100);
    });
  }

  function coinEarned() {
    playTone(1200, 0.1, 'sine', 0.2);
  }

  function error() {
    playTone(150, 0.08, 'square', 0.15);
  }

  function matchFound() {
    playTone(440, 0.15, 'sine', 0.3);
    setTimeout(() => playTone(660, 0.2, 'sine', 0.3), 150);
  }

  function setEnabled(enabled) { sfxEnabled = enabled; }
  function isEnabled() { return sfxEnabled; }
  function setVolume(v) { volume = Math.max(0, Math.min(1, v)); }
  function getVolume() { return volume; }

  document.addEventListener('click', resumeContext, { once: true });
  document.addEventListener('keydown', resumeContext, { once: true });

  return {
    keypress, countdownBeep, countdownGo, roundWin, roundLose,
    attackReceived, attackSent, levelUp, coinEarned, error, matchFound,
    setEnabled, isEnabled, setVolume, getVolume
  };
})();
