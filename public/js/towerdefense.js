const TowerDefense = (() => {
  let active = false;
  let wordBank = null;
  let enemies = [];
  let enemyIdCounter = 0;
  let wave = 0;
  let lives = 0;
  let maxLives = 5;
  let score = 0;
  let combo = 0;
  let totalKills = 0;
  let totalKeystrokes = 0;
  let correctKeystrokes = 0;
  let upgrades = [];
  let animFrameId = null;
  let lastFrameTime = 0;
  let startTime = 0;
  let waveActive = false;
  let waveExpectedCount = 0;
  let waveSpawnedCount = 0;
  let targetedEnemyId = null;
  let betweenWaves = false;

  const HEART_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

  const BASE_SPEED = 30;
  const SPEED_SCALE_PER_WAVE = 1.5;

  const UPGRADE_DEFS = [
    { id: 'slow_field', name: 'Slow Field', desc: 'All enemies move 15% slower', stackable: true },
    { id: 'extra_life', name: 'Extra Life', desc: '+1 base life', stackable: true },
    { id: 'critical', name: 'Critical Strike', desc: '10% chance to instant-kill on first keystroke', stackable: true },
    { id: 'chain', name: 'Chain Lightning', desc: 'Kills deal 1 damage to nearest enemy', stackable: false },
    { id: 'shield', name: 'Shield', desc: 'Blocks the next enemy that reaches base', stackable: true },
    { id: 'combo_master', name: 'Combo Master', desc: '+10 bonus score per consecutive kill', stackable: true },
    { id: 'word_shorten', name: 'Word Shorten', desc: '15% chance enemies spawn with 2 fewer chars', stackable: true }
  ];

  const els = {};

  function cacheEls() {
    els.wave = document.getElementById('td-wave');
    els.score = document.getElementById('td-score');
    els.combo = document.getElementById('td-combo');
    els.lives = document.getElementById('td-lives');
    els.battlefield = document.getElementById('td-battlefield');
    els.lane = document.getElementById('td-lane');
    els.input = document.getElementById('td-typing-input');
    els.waveBanner = document.getElementById('td-wave-banner');
    els.waveBannerText = document.getElementById('td-wave-banner-text');
    els.upgradeOverlay = document.getElementById('td-upgrade-overlay');
    els.upgradeCards = document.getElementById('td-upgrade-cards');
    els.countdownOverlay = document.getElementById('td-countdown-overlay');
    els.countdownNumber = document.getElementById('td-countdown-number');
  }

  async function fetchWords() {
    if (wordBank) return;
    try {
      const res = await fetch('/api/tower-defense/words');
      wordBank = await res.json();
    } catch (e) {
      console.error('Failed to fetch TD word bank:', e);
      wordBank = { easy: ['the','and','but','from','with'], medium: ['about','between','through','another'], hard: ['important','different','something','understand'], all: [] };
    }
  }

  function pickWord(difficulty) {
    if (!wordBank) return 'error';
    const pool = wordBank[difficulty] || wordBank.easy;
    if (pool.length === 0) return 'word';

    const existingWords = new Set(enemies.map(e => e.word));
    const available = pool.filter(w => !existingWords.has(w));
    const src = available.length > 0 ? available : pool;

    let word = src[Math.floor(Math.random() * src.length)];

    const shortenCount = upgrades.filter(u => u === 'word_shorten').length;
    if (shortenCount > 0 && Math.random() < 0.15 * shortenCount && word.length > 3) {
      word = word.slice(0, Math.max(3, word.length - 2));
    }

    return word;
  }

  function pickBossSentence() {
    const words = [];
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      words.push(pickWord('medium'));
    }
    return words.join(' ');
  }

  function scrambleWord(word) {
    const chars = word.split('');
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const result = chars.join('');
    return result === word ? scrambleWord(word) : result;
  }

  function chaosCase(word) {
    return word.split('').map(c =>
      c === ' ' ? c : (Math.random() > 0.5 ? c.toUpperCase() : c.toLowerCase())
    ).join('');
  }

  function getWaveConfig(w) {
    const baseCount = Math.min(3 + Math.floor(w * 0.8), 15);
    const speed = BASE_SPEED + w * SPEED_SCALE_PER_WAVE;
    const types = [];

    if (w <= 5) {
      types.push('basic');
    } else if (w <= 10) {
      types.push('basic', 'tank', 'sprinter');
    } else if (w <= 15) {
      types.push('basic', 'tank', 'sprinter', 'armored', 'scrambled');
    } else if (w <= 20) {
      types.push('basic', 'tank', 'sprinter', 'armored', 'scrambled', 'chaos', 'splitter');
    } else {
      types.push('basic', 'tank', 'sprinter', 'armored', 'scrambled', 'chaos', 'splitter');
    }

    const hasBoss = w > 0 && w % 5 === 0;
    return { count: baseCount, speed, types, hasBoss };
  }

  function createEnemy(type, baseSpeed) {
    const id = ++enemyIdCounter;
    let word, displayWord, difficulty;

    if (type === 'boss') {
      word = pickBossSentence();
      displayWord = word;
      difficulty = 'hard';
    } else if (type === 'tank') {
      word = pickWord('hard');
      displayWord = word;
      difficulty = 'hard';
    } else if (type === 'sprinter') {
      word = pickWord('easy');
      displayWord = word;
      difficulty = 'easy';
    } else if (type === 'scrambled') {
      word = pickWord('medium');
      displayWord = scrambleWord(word);
      difficulty = 'medium';
    } else if (type === 'chaos') {
      word = pickWord('medium');
      displayWord = chaosCase(word);
      word = displayWord;
      difficulty = 'medium';
    } else {
      const diff = wave > 10 ? 'medium' : 'easy';
      word = pickWord(diff);
      displayWord = word;
      difficulty = diff;
    }

    let speed = baseSpeed;
    if (type === 'tank' || type === 'boss') speed *= 0.5;
    if (type === 'sprinter') speed *= 2;

    const slowCount = upgrades.filter(u => u === 'slow_field').length;
    if (slowCount > 0) speed *= Math.pow(0.85, slowCount);

    const laneEl = els.lane;
    const laneH = laneEl.offsetHeight;
    const margin = 40;
    const yPos = margin + Math.random() * Math.max(0, laneH - margin * 2 - 40);

    return {
      id,
      type,
      word,
      displayWord,
      typed: '',
      x: laneEl.offsetWidth + 20,
      y: yPos,
      speed,
      hp: type === 'boss' ? 1 : 1,
      maxHp: type === 'boss' ? 1 : 1,
      alive: true,
      el: null
    };
  }

  function spawnWave() {
    wave++;
    const config = getWaveConfig(wave);
    const spawnList = [];

    for (let i = 0; i < config.count; i++) {
      const type = config.types[Math.floor(Math.random() * config.types.length)];
      spawnList.push({ type, delay: i * 800 + Math.random() * 400 });
    }

    if (config.hasBoss) {
      spawnList.push({ type: 'boss', delay: config.count * 800 + 500 });
    }

    waveExpectedCount = spawnList.length;
    waveSpawnedCount = 0;

    updateUI();
    showWaveBanner(`WAVE ${wave}`);

    setTimeout(() => {
      waveActive = true;

      for (const item of spawnList) {
        setTimeout(() => {
          if (!active) return;
          const enemy = createEnemy(item.type, config.speed);
          enemies.push(enemy);
          renderEnemy(enemy);
          waveSpawnedCount++;
        }, item.delay);
      }
    }, 1600);
  }

  function renderEnemy(enemy) {
    const el = document.createElement('div');
    el.className = `td-enemy ${enemy.type}`;
    el.dataset.enemyId = enemy.id;
    el.innerHTML = escapeHtml(enemy.displayWord);
    el.style.position = 'absolute';
    el.style.left = enemy.x + 'px';
    el.style.top = enemy.y + 'px';

    if (enemy.type === 'boss') {
      const hpBar = document.createElement('div');
      hpBar.className = 'td-enemy-hp-bar';
      hpBar.innerHTML = '<div class="td-enemy-hp-fill" style="width:100%"></div>';
      el.appendChild(hpBar);
    }

    els.lane.appendChild(el);
    enemy.el = el;
  }

  function updateEnemyDisplay(enemy) {
    if (!enemy.el || !enemy.alive) return;

    if (enemy.typed.length > 0) {
      const typedPart = escapeHtml(enemy.displayWord.slice(0, enemy.typed.length));
      const restPart = escapeHtml(enemy.displayWord.slice(enemy.typed.length));
      let html = `<span class="td-enemy-progress">${typedPart}</span>${restPart}`;
      if (enemy.type === 'boss') {
        html += enemy.el.querySelector('.td-enemy-hp-bar')?.outerHTML || '';
      }
      enemy.el.innerHTML = html;
    } else {
      let html = escapeHtml(enemy.displayWord);
      if (enemy.type === 'boss') {
        html += enemy.el.querySelector('.td-enemy-hp-bar')?.outerHTML || '';
      }
      enemy.el.innerHTML = html;
    }

    enemy.el.classList.toggle('targeted', enemy.id === targetedEnemyId);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function gameLoop(timestamp) {
    if (!active) return;

    if (!lastFrameTime) lastFrameTime = timestamp;
    const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
    lastFrameTime = timestamp;

    let allDead = true;

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      allDead = false;

      enemy.x -= enemy.speed * dt;

      if (enemy.el) {
        enemy.el.style.left = enemy.x + 'px';
      }

      if (enemy.x + (enemy.el?.offsetWidth || 80) < 0) {
        enemyReachedBase(enemy);
      }
    }

    const allSpawned = waveSpawnedCount >= waveExpectedCount;
    if (waveActive && allSpawned && allDead && enemies.every(e => !e.alive)) {
      waveActive = false;
      waveComplete();
    }

    animFrameId = requestAnimationFrame(gameLoop);
  }

  function enemyReachedBase(enemy) {
    if (!enemy.alive) return;
    enemy.alive = false;
    if (enemy.el) {
      enemy.el.classList.add('dying');
      setTimeout(() => enemy.el?.remove(), 300);
    }

    if (targetedEnemyId === enemy.id) {
      targetedEnemyId = null;
      els.input.value = '';
    }

    const hasShield = upgrades.indexOf('shield');
    if (hasShield >= 0) {
      upgrades.splice(hasShield, 1);
      return;
    }

    lives--;
    combo = 0;
    updateUI();

    if (lives <= 0) {
      endGame();
    }
  }

  function killEnemy(enemy) {
    if (!enemy.alive) return;
    enemy.alive = false;
    totalKills++;
    combo++;

    let killScore = enemy.displayWord.length * 10;
    const comboMasterCount = upgrades.filter(u => u === 'combo_master').length;
    if (comboMasterCount > 0) {
      killScore += combo * 10 * comboMasterCount;
    }
    score += killScore;

    if (enemy.el) {
      enemy.el.classList.add('dying');
      setTimeout(() => enemy.el?.remove(), 300);
    }

    if (targetedEnemyId === enemy.id) {
      targetedEnemyId = null;
    }

    if (upgrades.includes('chain')) {
      const nearest = findNearestAliveEnemy(enemy);
      if (nearest) {
        nearest.hp--;
        if (nearest.hp <= 0) {
          killEnemy(nearest);
        }
      }
    }

    if (enemy.type === 'splitter') {
      spawnSplitChildren(enemy);
    }

    if (enemy.type === 'boss') {
      score += 500;
    }

    updateUI();
  }

  function spawnSplitChildren(parent) {
    for (let i = 0; i < 2; i++) {
      const child = createEnemy('basic', parent.speed * 1.2);
      child.x = parent.x + (i * 40);
      child.y = parent.y + (i === 0 ? -20 : 20);
      enemies.push(child);
      renderEnemy(child);
    }
  }

  function findNearestAliveEnemy(source) {
    let nearest = null;
    let minDist = Infinity;
    for (const e of enemies) {
      if (!e.alive || e.id === source.id) continue;
      const dist = Math.abs(e.x - source.x) + Math.abs(e.y - source.y);
      if (dist < minDist) {
        minDist = dist;
        nearest = e;
      }
    }
    return nearest;
  }

  function handleInput() {
    if (!active || betweenWaves) return;

    const value = els.input.value;
    totalKeystrokes++;

    if (value === '') {
      targetedEnemyId = null;
      enemies.forEach(e => updateEnemyDisplay(e));
      return;
    }

    const critCount = upgrades.filter(u => u === 'critical').length;
    if (critCount > 0 && value.length === 1) {
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        const matchWord = enemy.type === 'armored' ? enemy.displayWord : enemy.displayWord;
        if (matchWord.startsWith(value) && Math.random() < 0.1 * critCount) {
          correctKeystrokes++;
          els.input.value = '';
          killEnemy(enemy);
          enemies.forEach(e => updateEnemyDisplay(e));
          return;
        }
      }
    }

    let bestMatch = null;
    let bestX = Infinity;

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const matchWord = enemy.displayWord;
      if (matchWord.startsWith(value)) {
        if (enemy.x < bestX) {
          bestX = enemy.x;
          bestMatch = enemy;
        }
      }
    }

    if (bestMatch) {
      correctKeystrokes++;
      targetedEnemyId = bestMatch.id;
      bestMatch.typed = value;
      els.input.classList.remove('error');

      if (value === bestMatch.displayWord) {
        els.input.value = '';
        killEnemy(bestMatch);
        targetedEnemyId = null;
      }
    } else {
      if (targetedEnemyId) {
        const targeted = enemies.find(e => e.id === targetedEnemyId && e.alive);
        if (targeted && targeted.displayWord.startsWith(value)) {
          correctKeystrokes++;
          targeted.typed = value;

          if (value === targeted.displayWord) {
            els.input.value = '';
            killEnemy(targeted);
            targetedEnemyId = null;
          }
        } else if (targeted && targeted.type === 'armored') {
          els.input.value = '';
          targeted.typed = '';
          targetedEnemyId = null;
          combo = 0;
          els.input.classList.add('error');
          setTimeout(() => els.input.classList.remove('error'), 300);
        } else {
          els.input.classList.add('error');
          setTimeout(() => els.input.classList.remove('error'), 300);
        }
      } else {
        els.input.classList.add('error');
        setTimeout(() => els.input.classList.remove('error'), 300);
      }
    }

    enemies.forEach(e => {
      if (e.alive) updateEnemyDisplay(e);
    });
    updateUI();
  }

  function waveComplete() {
    betweenWaves = true;
    score += wave * 50;
    updateUI();

    if (wave >= 1) {
      showUpgradePicker();
    } else {
      setTimeout(() => {
        betweenWaves = false;
        spawnWave();
      }, 1000);
    }
  }

  function showUpgradePicker() {
    const available = UPGRADE_DEFS.filter(u =>
      u.stackable || !upgrades.includes(u.id)
    );

    const shuffled = available.sort(() => Math.random() - 0.5);
    const picks = shuffled.slice(0, 3);

    let html = '';
    picks.forEach((u, i) => {
      html += `<div class="td-upgrade-card" data-upgrade-id="${u.id}">
        <span class="td-upgrade-card-key">${i + 1}</span>
        <span class="td-upgrade-card-name">${u.name}</span>
        <span class="td-upgrade-card-desc">${u.desc}</span>
      </div>`;
    });
    els.upgradeCards.innerHTML = html;
    els.upgradeOverlay.style.display = '';

    const clickHandler = (e) => {
      const card = e.target.closest('.td-upgrade-card');
      if (!card) return;
      applyUpgrade(card.dataset.upgradeId);
      els.upgradeOverlay.style.display = 'none';
      els.upgradeCards.removeEventListener('click', clickHandler);
      document.removeEventListener('keydown', keyHandler);
      betweenWaves = false;
      els.input.focus();
      spawnWave();
    };

    const keyHandler = (e) => {
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < picks.length) {
        applyUpgrade(picks[idx].id);
        els.upgradeOverlay.style.display = 'none';
        els.upgradeCards.removeEventListener('click', clickHandler);
        document.removeEventListener('keydown', keyHandler);
        betweenWaves = false;
        els.input.focus();
        spawnWave();
      }
    };

    els.upgradeCards.addEventListener('click', clickHandler);
    document.addEventListener('keydown', keyHandler);
  }

  function applyUpgrade(id) {
    upgrades.push(id);

    if (id === 'extra_life') {
      maxLives++;
      lives++;
    }

    updateUI();
  }

  function showWaveBanner(text) {
    els.waveBannerText.textContent = text;
    els.waveBanner.style.display = '';
    setTimeout(() => {
      els.waveBanner.style.display = 'none';
    }, 1500);
  }

  function updateUI() {
    if (els.wave) els.wave.textContent = wave;
    if (els.score) els.score.textContent = score;
    if (els.combo) els.combo.textContent = combo;

    if (els.lives) {
      let html = '';
      for (let i = 0; i < maxLives; i++) {
        html += `<span class="td-heart${i >= lives ? ' lost' : ''}">${HEART_SVG}</span>`;
      }
      els.lives.innerHTML = html;
    }
  }

  async function startGame() {
    cacheEls();
    await fetchWords();
    reset();

    active = true;
    lives = maxLives;
    startTime = Date.now();
    updateUI();

    els.input.disabled = false;
    els.input.value = '';
    els.input.focus();

    lastFrameTime = 0;
    animFrameId = requestAnimationFrame(gameLoop);
    spawnWave();
  }

  function reset() {
    active = false;
    enemies = [];
    enemyIdCounter = 0;
    wave = 0;
    lives = 0;
    maxLives = 5;
    score = 0;
    combo = 0;
    totalKills = 0;
    totalKeystrokes = 0;
    correctKeystrokes = 0;
    upgrades = [];
    waveActive = false;
    waveExpectedCount = 0;
    waveSpawnedCount = 0;
    targetedEnemyId = null;
    betweenWaves = false;

    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }

    if (els.lane) els.lane.innerHTML = '';
    if (els.upgradeOverlay) els.upgradeOverlay.style.display = 'none';
    if (els.waveBanner) els.waveBanner.style.display = 'none';
    if (els.input) {
      els.input.value = '';
      els.input.disabled = true;
    }
  }

  function endGame() {
    active = false;
    waveActive = false;

    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }

    if (els.input) els.input.disabled = true;
    if (els.upgradeOverlay) els.upgradeOverlay.style.display = 'none';

    const durationMs = Date.now() - startTime;
    const accuracy = totalKeystrokes > 0 ? Math.round((correctKeystrokes / totalKeystrokes) * 100) : 0;

    showResults(wave, score, totalKills, accuracy, durationMs);
  }

  async function showResults(wavesSurvived, finalScore, kills, accuracy, durationMs) {
    const rWave = document.getElementById('td-result-wave');
    const rScore = document.getElementById('td-result-score');
    const rKills = document.getElementById('td-result-kills');
    const rAcc = document.getElementById('td-result-accuracy');
    const rDur = document.getElementById('td-result-duration');

    if (rWave) rWave.textContent = wavesSurvived;
    if (rScore) rScore.textContent = finalScore;
    if (rKills) rKills.textContent = kills;
    if (rAcc) rAcc.textContent = accuracy + '%';
    if (rDur) {
      const totalSec = Math.floor(durationMs / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      rDur.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
    }

    UI.showScreen('towerdefenseResult');

    const xpDisplay = document.getElementById('td-xp-gain-display');
    const coinDisplay = document.getElementById('td-coin-gain-display');
    if (xpDisplay) xpDisplay.style.display = 'none';
    if (coinDisplay) coinDisplay.style.display = 'none';

    try {
      const token = localStorage.getItem('sb-smnhckjzyawgzrgwzjcq-auth-token');
      let accessToken = null;
      if (token) {
        const parsed = JSON.parse(token);
        accessToken = parsed?.access_token || parsed?.currentSession?.access_token;
      }

      if (!accessToken && window.supabase) {
        const sb = window.supabase.createClient(
          'https://smnhckjzyawgzrgwzjcq.supabase.co',
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtbmhja2p6eWF3Z3pyZ3d6amNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTI3MzksImV4cCI6MjA4NzEyODczOX0.Hpd_oSIYrCr6zv2OI1CdOpU0vVhaLFhDHRt4G0LLCnc'
        );
        const { data: { session } } = await sb.auth.getSession();
        if (session) accessToken = session.access_token;
      }

      if (!accessToken) return;

      const res = await fetch('/api/tower-defense/result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          wavesSurvived,
          enemiesKilled: kills,
          score: finalScore,
          accuracy,
          durationMs
        })
      });

      if (!res.ok) return;
      const data = await res.json();

      if (data.xp && xpDisplay) {
        const xpAmount = document.getElementById('td-xp-gain-amount');
        const xpPb = document.getElementById('td-xp-gain-pb');
        const xpLevelup = document.getElementById('td-xp-gain-levelup');

        if (xpAmount) xpAmount.textContent = `+${data.xp.xpGained} XP`;
        if (xpPb) xpPb.style.display = data.xp.isPb ? '' : 'none';
        if (xpLevelup) {
          if (data.xp.newLevel > data.xp.oldLevel) {
            xpLevelup.textContent = `LEVEL UP! LV. ${data.xp.newLevel}`;
            xpLevelup.style.display = '';
          } else {
            xpLevelup.style.display = 'none';
          }
        }
        xpDisplay.style.display = '';
      }

      if (data.xp && data.xp.coinsGained && coinDisplay) {
        const coinAmount = document.getElementById('td-coin-gain-amount');
        if (coinAmount) coinAmount.textContent = `+${data.xp.coinsGained}`;
        coinDisplay.style.display = '';
      }
    } catch (e) {
      console.error('TD result submit error:', e);
    }
  }

  function isActive() { return active; }
  function getInput() { cacheEls(); return els.input; }

  return {
    startGame,
    reset,
    handleInput,
    isActive,
    getInput,
    cacheEls
  };
})();
