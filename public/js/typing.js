const TypingEngine = (() => {
  let sentence = '';
  let typed = '';
  let startTime = null;
  let corrections = 0;
  let totalErrors = 0;
  let active = false;
  let onUpdate = null;
  let onComplete = null;
  let updateInterval = null;

  function start(newSentence, callbacks) {
    sentence = newSentence;
    typed = '';
    startTime = Date.now();
    corrections = 0;
    totalErrors = 0;
    active = true;
    onUpdate = callbacks.onUpdate || null;
    onComplete = callbacks.onComplete || null;

    updateInterval = setInterval(() => {
      if (active && onUpdate) {
        onUpdate(getState());
      }
    }, 400);
  }

  function handleInput(inputValue) {
    if (!active) return;

    const prevLen = typed.length;
    const newLen = inputValue.length;

    if (newLen < prevLen) {
      corrections += prevLen - newLen;
    }

    if (newLen > prevLen) {
      for (let i = prevLen; i < newLen && i < sentence.length; i++) {
        if (inputValue[i] !== sentence[i]) {
          totalErrors++;
        }
      }
    }

    typed = inputValue;

    if (onUpdate) onUpdate(getState());

    if (typed.length >= sentence.length) {
      finish();
    }
  }

  function finish() {
    if (!active) return;
    active = false;
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }

    const state = getState();
    if (onComplete) onComplete(state);
  }

  function getState() {
    const elapsed = startTime ? Date.now() - startTime : 0;
    const elapsedMin = elapsed / 60000;
    const wpm = elapsedMin > 0 ? Math.round((typed.length / 5) / elapsedMin) : 0;

    let uncorrected = 0;
    for (let i = 0; i < typed.length && i < sentence.length; i++) {
      if (typed[i] !== sentence[i]) uncorrected++;
    }

    const base = wpm * 10;
    const penalty = (uncorrected * 50) + (corrections * 15);
    const score = Math.max(0, Math.round(base - penalty));

    return {
      typed,
      position: typed.length,
      wpm,
      uncorrectedErrors: uncorrected,
      correctedErrors: corrections,
      totalErrors,
      score,
      time: elapsed,
      progress: Math.min(1, typed.length / sentence.length),
      complete: typed.length >= sentence.length
    };
  }

  function getCharStates() {
    const states = [];
    for (let i = 0; i < sentence.length; i++) {
      if (i < typed.length) {
        states.push(typed[i] === sentence[i] ? 'correct' : 'error');
      } else if (i === typed.length) {
        states.push('current');
      } else {
        states.push('pending');
      }
    }
    return states;
  }

  function updateSentence(newSentence) {
    sentence = newSentence;
  }

  function isActive() { return active; }

  function reset() {
    active = false;
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
    sentence = '';
    typed = '';
    startTime = null;
    corrections = 0;
    totalErrors = 0;
  }

  return { start, handleInput, getState, getCharStates, isActive, reset, finish, updateSentence };
})();
