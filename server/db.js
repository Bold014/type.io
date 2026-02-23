const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function xpToLevel(xp) {
  return Math.floor(
    Math.pow(xp / 500, 0.6) + xp / 5000 + Math.max(0, xp - 4000000) / 5000 + 1
  );
}

function computeXpGain(mode, totalTimeMs, won, wpm, currentBestWpm, lastPbAt) {
  const minutes = totalTimeMs / 60000;
  const xpPerMin = mode === 'ranked' ? 250 : 200;
  const cap = mode === 'ranked' ? 3750 : 3000;

  let xpGained = Math.min(cap, Math.round(xpPerMin * minutes));

  if (won) xpGained += 200;

  let isPb = false;
  let pbBonusXp = false;
  let newBestWpm = currentBestWpm || 0;

  if (wpm > newBestWpm) {
    isPb = true;
    newBestWpm = wpm;

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastPb = lastPbAt ? new Date(lastPbAt) : null;

    if (!lastPb || lastPb < oneDayAgo) {
      xpGained += 500;
      pbBonusXp = true;
    }
  }

  return { xpGained, newBestWpm, isPb, pbBonusXp };
}

const CHAR_VALUE_UPGRADES = [
  { level: 0, value: 1,   cost: 0 },
  { level: 1, value: 2,   cost: 500 },
  { level: 2, value: 4,   cost: 2000 },
  { level: 3, value: 7,   cost: 8000 },
  { level: 4, value: 12,  cost: 30000 },
  { level: 5, value: 20,  cost: 100000 },
  { level: 6, value: 35,  cost: 350000 },
  { level: 7, value: 60,  cost: 1000000 },
  { level: 8, value: 100, cost: 3000000 },
  { level: 9, value: 175, cost: 10000000 },
];

function computeMoneyFromChars(charsTyped, charValueLevel) {
  const upgrade = CHAR_VALUE_UPGRADES[charValueLevel] || CHAR_VALUE_UPGRADES[0];
  return (charsTyped || 0) * upgrade.value;
}

const PLACEMENT_GAMES = 5;

const PROFILE_COLS = 'id, username, rating, wins, losses, avg_wpm, games_played, xp, best_wpm, best_tt_wpm, last_pb_at, ranked_games_played, coins, last_daily_win, total_chars_typed, char_value_level';
const PROFILE_COLS_EMAIL = 'id, username, email, rating, wins, losses, avg_wpm, games_played, xp, best_wpm, best_tt_wpm, last_pb_at, ranked_games_played, coins, last_daily_win, total_chars_typed, char_value_level';

async function findUserById(id) {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLS_EMAIL)
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

async function findUserByUsername(username) {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLS_EMAIL)
    .ilike('username', username)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('findUserByUsername error:', error.message);
    }
    return null;
  }
  return data;
}

async function updateStats(userId, won, wpm, opponentRating, mode, totalTimeMs, charsTyped) {
  const user = await findUserById(userId);
  if (!user) return null;

  const newGamesPlayed = user.games_played + 1;
  const newAvgWpm = ((user.avg_wpm * user.games_played) + wpm) / newGamesPlayed;

  const rankedPlayed = user.ranked_games_played || 0;
  const isPlacement = rankedPlayed < PLACEMENT_GAMES;
  const K = isPlacement ? 64 : 32;
  const expected = 1 / (1 + Math.pow(10, ((opponentRating || 1000) - user.rating) / 400));
  const actual = won ? 1 : 0;
  const ratingDelta = Math.round(K * (actual - expected));
  const newRating = Math.max(0, user.rating + ratingDelta);
  const newRankedGamesPlayed = rankedPlayed + 1;
  const placementGamesLeft = Math.max(0, PLACEMENT_GAMES - newRankedGamesPlayed);

  const oldLevel = xpToLevel(user.xp || 0);
  const { xpGained, newBestWpm, isPb, pbBonusXp } = computeXpGain(
    mode || 'ranked', totalTimeMs || 0, won, wpm, user.best_wpm, user.last_pb_at
  );
  const newXp = (user.xp || 0) + xpGained;
  const newLevel = xpToLevel(newXp);

  const charLevel = user.char_value_level || 0;
  const coinsGained = computeMoneyFromChars(charsTyped || 0, charLevel);
  const newCoins = (user.coins || 0) + coinsGained;
  const newTotalChars = (user.total_chars_typed || 0) + (charsTyped || 0);

  const updatePayload = {
    wins: user.wins + (won ? 1 : 0),
    losses: user.losses + (won ? 0 : 1),
    avg_wpm: newAvgWpm,
    games_played: newGamesPlayed,
    rating: newRating,
    xp: newXp,
    ranked_games_played: newRankedGamesPlayed,
    coins: newCoins,
    total_chars_typed: newTotalChars
  };

  if (isPb) {
    updatePayload.best_wpm = newBestWpm;
  }
  if (pbBonusXp) {
    updatePayload.last_pb_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', userId);

  if (error) {
    console.error('updateStats error:', error);
    return null;
  }

  return {
    ratingDelta, newRating, xpGained, newXp, oldLevel, newLevel, isPb,
    isPlacement, placementGamesLeft, rankedGamesPlayed: newRankedGamesPlayed,
    coinsGained, newCoins, charsTyped: charsTyped || 0, charValue: (CHAR_VALUE_UPGRADES[charLevel] || CHAR_VALUE_UPGRADES[0]).value
  };
}

async function updateXpOnly(userId, won, wpm, mode, totalTimeMs, charsTyped) {
  const user = await findUserById(userId);
  if (!user) return null;

  const oldLevel = xpToLevel(user.xp || 0);
  const { xpGained, newBestWpm, isPb, pbBonusXp } = computeXpGain(
    mode || 'quick', totalTimeMs || 0, won, wpm, user.best_wpm, user.last_pb_at
  );
  const newXp = (user.xp || 0) + xpGained;
  const newLevel = xpToLevel(newXp);

  const newGamesPlayed = (user.games_played || 0) + 1;
  const newAvgWpm = ((user.avg_wpm || 0) * (user.games_played || 0) + wpm) / newGamesPlayed;

  const charLevel = user.char_value_level || 0;
  const coinsGained = computeMoneyFromChars(charsTyped || 0, charLevel);
  const newCoins = (user.coins || 0) + coinsGained;
  const newTotalChars = (user.total_chars_typed || 0) + (charsTyped || 0);

  const updatePayload = {
    xp: newXp,
    games_played: newGamesPlayed,
    avg_wpm: newAvgWpm,
    wins: (user.wins || 0) + (won ? 1 : 0),
    losses: (user.losses || 0) + (won ? 0 : 1),
    coins: newCoins,
    total_chars_typed: newTotalChars
  };

  if (isPb) {
    updatePayload.best_wpm = newBestWpm;
  }
  if (pbBonusXp) {
    updatePayload.last_pb_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', userId);

  if (error) {
    console.error('updateXpOnly error:', error);
    return null;
  }

  return { xpGained, newXp, oldLevel, newLevel, isPb, coinsGained, newCoins, charsTyped: charsTyped || 0, charValue: (CHAR_VALUE_UPGRADES[charLevel] || CHAR_VALUE_UPGRADES[0]).value };
}

async function updateEmail(userId, email) {
  const { error } = await supabase
    .from('profiles')
    .update({ email })
    .eq('id', userId);

  if (error) {
    console.error('updateEmail error:', error);
    return false;
  }
  return true;
}

async function saveAscendRun(userId, username, height, tier, durationMs) {
  const { error } = await supabase
    .from('ascend_runs')
    .insert({
      user_id: userId,
      username,
      height,
      tier,
      duration_ms: durationMs,
      created_at: new Date().toISOString()
    });

  if (error) {
    console.error('saveAscendRun error:', error);
  }
}

async function getWeeklyLeaderboard(limit = 20) {
  const now = new Date();
  const day = now.getUTCDay();
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((day + 6) % 7));
  monday.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase.rpc('get_weekly_ascend_leaderboard', {
    p_monday: monday.toISOString(),
    p_limit: limit
  });

  if (error) {
    console.error('getWeeklyLeaderboard error:', error);
    return [];
  }

  return data || [];
}

async function getUserBestHeight(userId) {
  const { data, error } = await supabase
    .from('ascend_runs')
    .select('height, tier')
    .eq('user_id', userId)
    .order('height', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0];
}

async function saveMatchResult(userId, data) {
  const { error } = await supabase
    .from('match_history')
    .insert({
      user_id: userId,
      opponent_username: data.opponentUsername,
      mode: data.mode,
      won: data.won,
      user_wpm: data.userWpm,
      opponent_wpm: data.opponentWpm,
      rounds_won: data.roundsWon,
      rounds_lost: data.roundsLost,
      rating_change: data.ratingChange || null,
      xp_gained: data.xpGained || 0,
      created_at: new Date().toISOString()
    });

  if (error) {
    console.error('saveMatchResult error:', error);
  }
}

async function getMatchHistory(userId, limit = 10) {
  const { data, error } = await supabase
    .from('match_history')
    .select('id, opponent_username, mode, won, user_wpm, opponent_wpm, rounds_won, rounds_lost, rating_change, xp_gained, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('getMatchHistory error:', error);
    return [];
  }
  return data;
}

async function getAscendLeaderboard(limit = 50) {
  const { data, error } = await supabase.rpc('get_ascend_leaderboard', {
    p_limit: limit
  });

  if (error) {
    console.error('getAscendLeaderboard error:', error);
    return [];
  }

  return data || [];
}

async function getLeaderboard(category = 'rating', limit = 50) {
  if (category === 'ascend') {
    return getAscendLeaderboard(limit);
  }

  const validCategories = {
    rating: { column: 'rating', ascending: false },
    best_wpm: { column: 'best_wpm', ascending: false },
    wins: { column: 'wins', ascending: false },
    xp: { column: 'xp', ascending: false },
    coins: { column: 'coins', ascending: false }
  };

  const config = validCategories[category] || validCategories.rating;

  let query = supabase
    .from('profiles')
    .select('id, username, rating, wins, losses, avg_wpm, games_played, xp, best_wpm, ranked_games_played, coins');

  if (category === 'rating') {
    query = query.gte('ranked_games_played', PLACEMENT_GAMES);
  } else if (category === 'wins') {
    query = query.gt('wins', 0);
  } else if (category === 'best_wpm') {
    query = query.gt('best_wpm', 0);
  } else if (category === 'coins') {
    query = query.gt('coins', 0);
  } else {
    query = query.gt('xp', 0);
  }

  const { data, error } = await query
    .order(config.column, { ascending: config.ascending })
    .limit(limit);

  if (error) {
    console.error('getLeaderboard error:', error);
    return [];
  }
  return data;
}

async function getUserAscendStats(userId) {
  const { data, error } = await supabase
    .from('ascend_runs')
    .select('height, tier, duration_ms')
    .eq('user_id', userId)
    .order('height', { ascending: false });

  if (error || !data || data.length === 0) {
    return { bestHeight: 0, bestTier: 0, totalRuns: 0, avgHeight: 0 };
  }

  const totalRuns = data.length;
  const bestHeight = data[0].height;
  const bestTier = data[0].tier;
  const avgHeight = data.reduce((sum, r) => sum + r.height, 0) / totalRuns;

  return { bestHeight, bestTier, totalRuns, avgHeight: Math.round(avgHeight * 10) / 10 };
}

async function saveTimeTrialRun(userId, username, data) {
  const { error } = await supabase
    .from('time_trial_runs')
    .insert({
      user_id: userId,
      username,
      duration: data.duration,
      wpm: data.wpm,
      accuracy: data.accuracy,
      characters_typed: data.charactersTyped,
      correct_characters: data.correctCharacters,
      errors: data.errors,
      created_at: new Date().toISOString()
    });

  if (error) {
    console.error('saveTimeTrialRun error:', error);
    return null;
  }

  const user = await findUserById(userId);
  if (!user) return null;

  const oldLevel = xpToLevel(user.xp || 0);
  const durationMs = data.duration * 1000;
  const minutes = durationMs / 60000;
  let xpGained = Math.min(3000, Math.round(200 * minutes));

  let isPb = false;
  const currentBest = user.best_tt_wpm || 0;
  if (data.wpm > currentBest) {
    isPb = true;
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastPb = user.last_pb_at ? new Date(user.last_pb_at) : null;
    if (!lastPb || lastPb < oneDayAgo) {
      xpGained += 500;
    }
  }

  const newXp = (user.xp || 0) + xpGained;
  const newLevel = xpToLevel(newXp);

  const charLevel = user.char_value_level || 0;
  const charsTyped = data.charactersTyped || 0;
  const coinsGained = computeMoneyFromChars(charsTyped, charLevel);
  const newCoins = (user.coins || 0) + coinsGained;
  const newTotalChars = (user.total_chars_typed || 0) + charsTyped;

  const updatePayload = { xp: newXp, coins: newCoins, total_chars_typed: newTotalChars };
  if (isPb) {
    updatePayload.best_tt_wpm = data.wpm;
    updatePayload.last_pb_at = new Date().toISOString();
  }

  await supabase.from('profiles').update(updatePayload).eq('id', userId);

  return { xpGained, newXp, oldLevel, newLevel, isPb, coinsGained, newCoins, charsTyped, charValue: (CHAR_VALUE_UPGRADES[charLevel] || CHAR_VALUE_UPGRADES[0]).value, newTotalChars };
}

async function getTimeTrialLeaderboard(duration, limit = 50) {
  const { data, error } = await supabase.rpc('get_time_trial_leaderboard', {
    p_duration: duration,
    p_limit: limit
  });

  if (error) {
    console.error('getTimeTrialLeaderboard error:', error);
    return [];
  }

  return data || [];
}

async function getUserTimeTrialStats(userId) {
  const { data, error } = await supabase
    .from('time_trial_runs')
    .select('duration, wpm, accuracy')
    .eq('user_id', userId)
    .order('wpm', { ascending: false });

  if (error || !data || data.length === 0) {
    return { totalRuns: 0, avgWpm: 0, bestByDuration: {} };
  }

  const totalRuns = data.length;
  const avgWpm = Math.round(data.reduce((sum, r) => sum + Number(r.wpm), 0) / totalRuns);

  const bestByDuration = {};
  for (const row of data) {
    const d = row.duration;
    if (!bestByDuration[d] || row.wpm > bestByDuration[d].wpm) {
      bestByDuration[d] = { wpm: Math.round(Number(row.wpm)), accuracy: Math.round(Number(row.accuracy) * 10) / 10 };
    }
  }

  return { totalRuns, avgWpm, bestByDuration };
}

async function checkUsernameExists(username) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', username)
    .limit(1);

  if (error) {
    console.error('checkUsernameExists error:', error.message);
    return { exists: false, dbError: true };
  }
  return { exists: data && data.length > 0, dbError: false };
}

// --- SHOP & INVENTORY ---

async function getShopItems() {
  const { data, error } = await supabase
    .from('shop_items')
    .select('*')
    .order('category')
    .order('sort_order');
  if (error) { console.error('getShopItems error:', error); return []; }
  return data || [];
}

async function getUserInventory(userId) {
  const { data, error } = await supabase
    .from('user_inventory')
    .select('item_id, purchased_at')
    .eq('user_id', userId);
  if (error) { console.error('getUserInventory error:', error); return []; }
  return data || [];
}

async function getUserEquipped(userId) {
  const { data, error } = await supabase
    .from('user_equipped')
    .select('category, item_id')
    .eq('user_id', userId);
  if (error) { console.error('getUserEquipped error:', error); return []; }
  return data || [];
}

async function getUserEquippedWithItems(userId) {
  const equipped = await getUserEquipped(userId);
  if (!equipped.length) return [];
  const itemIds = equipped.map(e => e.item_id);
  const { data: items, error } = await supabase
    .from('shop_items')
    .select('id, category, name, data')
    .in('id', itemIds);
  if (error) { console.error('getUserEquippedWithItems shop_items error:', error); return equipped; }
  const itemMap = {};
  (items || []).forEach(i => { itemMap[i.id] = i; });
  return equipped.map(e => {
    const item = itemMap[e.item_id];
    return item ? { ...e, ...item } : e;
  });
}

async function purchaseItem(userId, itemId) {
  const { data, error } = await supabase.rpc('purchase_shop_item', {
    p_user_id: userId,
    p_item_id: itemId
  });
  if (error) {
    console.error('purchaseItem RPC error:', error);
    return { success: false, error: 'Database error' };
  }
  return data || { success: false, error: 'Unknown error' };
}

async function equipItem(userId, itemId, category) {
  const { error } = await supabase
    .from('user_equipped')
    .upsert({ user_id: userId, category, item_id: itemId }, { onConflict: 'user_id,category' });
  if (error) {
    console.error('equipItem error:', error);
    return false;
  }
  return true;
}

async function unequipItem(userId, category) {
  const { error } = await supabase
    .from('user_equipped')
    .delete()
    .eq('user_id', userId)
    .eq('category', category);
  if (error) {
    console.error('unequipItem error:', error);
    return false;
  }
  return true;
}

async function addCoins(userId, amount) {
  const { data, error } = await supabase.rpc('add_coins', {
    p_user_id: userId,
    p_amount: amount
  });
  if (error) { console.error('addCoins error:', error); return null; }
  return data;
}

// --- DAILY CHALLENGES ---

const CHALLENGE_TEMPLATES = [
  { type: 'win_duels',          minTarget: 2,    maxTarget: 5,    minReward: 200, maxReward: 400 },
  { type: 'play_matches',       minTarget: 3,    maxTarget: 7,    minReward: 150, maxReward: 300 },
  { type: 'type_chars',         minTarget: 3000, maxTarget: 8000, minReward: 200, maxReward: 350 },
  { type: 'complete_climbs',    minTarget: 2,    maxTarget: 4,    minReward: 200, maxReward: 350 },
  { type: 'complete_timetrials', minTarget: 2,    maxTarget: 4,    minReward: 200, maxReward: 300 },
];

function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

function generateDailyChallenges(dateStr) {
  const seed = dateStr.split('-').join('') | 0;
  const rng = seededRandom(seed);

  const shuffled = [...CHALLENGE_TEMPLATES].sort(() => rng() - 0.5);
  const picked = shuffled.slice(0, 3);

  return picked.map(t => {
    const range = t.maxTarget - t.minTarget;
    const target = t.minTarget + Math.round(rng() * range);
    const pct = range > 0 ? (target - t.minTarget) / range : 0.5;
    const reward = Math.round(t.minReward + pct * (t.maxReward - t.minReward));
    return { challenge_type: t.type, target, coin_reward: reward };
  });
}

async function getUserDailyChallenges(userId) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing, error } = await supabase
    .from('daily_challenges')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today);

  if (error) { console.error('getUserDailyChallenges error:', error); return []; }
  if (existing && existing.length > 0) return existing;

  const templates = generateDailyChallenges(today);
  const rows = templates.map(t => ({
    user_id: userId,
    challenge_type: t.challenge_type,
    target: t.target,
    coin_reward: t.coin_reward,
    progress: 0,
    completed: false,
    date: today
  }));

  const { data: inserted, error: insertError } = await supabase
    .from('daily_challenges')
    .insert(rows)
    .select('*');

  if (insertError) {
    console.error('generateDailyChallenges insert error:', insertError);
    const { data: retry } = await supabase
      .from('daily_challenges')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today);
    return retry || [];
  }
  return inserted || [];
}

async function updateChallengeProgress(userId, challengeType, incrementBy) {
  if (!userId) return null;
  const today = new Date().toISOString().slice(0, 10);

  const { data: challenge, error } = await supabase
    .from('daily_challenges')
    .select('*')
    .eq('user_id', userId)
    .eq('challenge_type', challengeType)
    .eq('date', today)
    .single();

  if (error || !challenge || challenge.completed) return null;

  const newProgress = Math.min(challenge.target, challenge.progress + incrementBy);
  const nowComplete = newProgress >= challenge.target;

  const { error: updateError } = await supabase
    .from('daily_challenges')
    .update({ progress: newProgress, completed: nowComplete })
    .eq('id', challenge.id);

  if (updateError) { console.error('updateChallengeProgress error:', updateError); return null; }

  if (nowComplete) {
    await addCoins(userId, challenge.coin_reward);
  }

  return { challengeType, newProgress, target: challenge.target, completed: nowComplete, reward: nowComplete ? challenge.coin_reward : 0 };
}

// --- WEEKLY CHALLENGES ---

const WEEKLY_CHALLENGE_TEMPLATES = [
  { type: 'win_duels',           minTarget: 10,    maxTarget: 20,    minReward: 600,  maxReward: 1200 },
  { type: 'play_matches',        minTarget: 15,    maxTarget: 30,    minReward: 500,  maxReward: 1000 },
  { type: 'type_chars',          minTarget: 20000, maxTarget: 50000, minReward: 600,  maxReward: 1000 },
  { type: 'complete_climbs',     minTarget: 5,     maxTarget: 10,    minReward: 500,  maxReward: 900 },
  { type: 'complete_timetrials', minTarget: 5,     maxTarget: 10,    minReward: 500,  maxReward: 900 },
];

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function generateWeeklyChallenges(weekStartStr) {
  const seed = (weekStartStr.split('-').join('') | 0) + 7777;
  const rng = seededRandom(seed);

  const shuffled = [...WEEKLY_CHALLENGE_TEMPLATES].sort(() => rng() - 0.5);
  const picked = shuffled.slice(0, 3);

  return picked.map(t => {
    const range = t.maxTarget - t.minTarget;
    const target = t.minTarget + Math.round(rng() * range);
    const pct = range > 0 ? (target - t.minTarget) / range : 0.5;
    const reward = Math.round(t.minReward + pct * (t.maxReward - t.minReward));
    return { challenge_type: t.type, target, coin_reward: reward };
  });
}

async function getUserWeeklyChallenges(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = getWeekStart(today);

  const { data: existing, error } = await supabase
    .from('weekly_challenges')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart);

  if (error) { console.error('getUserWeeklyChallenges error:', error); return []; }
  if (existing && existing.length > 0) return existing;

  const templates = generateWeeklyChallenges(weekStart);
  const rows = templates.map(t => ({
    user_id: userId,
    challenge_type: t.challenge_type,
    target: t.target,
    coin_reward: t.coin_reward,
    progress: 0,
    completed: false,
    week_start: weekStart
  }));

  const { data: inserted, error: insertError } = await supabase
    .from('weekly_challenges')
    .insert(rows)
    .select('*');

  if (insertError) {
    console.error('getUserWeeklyChallenges insert error:', insertError);
    const { data: retry } = await supabase
      .from('weekly_challenges')
      .select('*')
      .eq('user_id', userId)
      .eq('week_start', weekStart);
    return retry || [];
  }
  return inserted || [];
}

async function updateWeeklyChallengeProgress(userId, challengeType, incrementBy) {
  if (!userId) return null;
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = getWeekStart(today);

  const { data: challenge, error } = await supabase
    .from('weekly_challenges')
    .select('*')
    .eq('user_id', userId)
    .eq('challenge_type', challengeType)
    .eq('week_start', weekStart)
    .single();

  if (error || !challenge || challenge.completed) return null;

  const newProgress = Math.min(challenge.target, challenge.progress + incrementBy);
  const nowComplete = newProgress >= challenge.target;

  const { error: updateError } = await supabase
    .from('weekly_challenges')
    .update({ progress: newProgress, completed: nowComplete })
    .eq('id', challenge.id);

  if (updateError) { console.error('updateWeeklyChallengeProgress error:', updateError); return null; }

  if (nowComplete) {
    await addCoins(userId, challenge.coin_reward);
  }

  return { challengeType, newProgress, target: challenge.target, completed: nowComplete, reward: nowComplete ? challenge.coin_reward : 0 };
}

// --- TOWER DEFENSE ---

async function saveTowerDefenseRun(userId, username, data) {
  const { error } = await supabase
    .from('tower_defense_runs')
    .insert({
      user_id: userId,
      username,
      waves_survived: data.wavesSurvived,
      enemies_killed: data.enemiesKilled,
      score: data.score,
      accuracy: data.accuracy,
      duration_ms: data.durationMs,
      created_at: new Date().toISOString()
    });

  if (error) {
    console.error('saveTowerDefenseRun error:', error);
    return null;
  }

  const user = await findUserById(userId);
  if (!user) return null;

  const oldLevel = xpToLevel(user.xp || 0);
  let xpGained = Math.min(3000, data.wavesSurvived * 100);

  let isPb = false;
  const currentBest = user.best_td_wave || 0;
  if (data.wavesSurvived > currentBest) {
    isPb = true;
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastPb = user.last_pb_at ? new Date(user.last_pb_at) : null;
    if (!lastPb || lastPb < oneDayAgo) {
      xpGained += 500;
    }
  }

  const newXp = (user.xp || 0) + xpGained;
  const newLevel = xpToLevel(newXp);

  const charLevel = user.char_value_level || 0;
  const charsTyped = data.charsTyped || 0;
  const coinsGained = computeMoneyFromChars(charsTyped, charLevel);
  const newCoins = (user.coins || 0) + coinsGained;
  const newTotalChars = (user.total_chars_typed || 0) + charsTyped;

  const updatePayload = { xp: newXp, coins: newCoins, total_chars_typed: newTotalChars };
  if (isPb) {
    updatePayload.best_td_wave = data.wavesSurvived;
    updatePayload.last_pb_at = new Date().toISOString();
  }

  await supabase.from('profiles').update(updatePayload).eq('id', userId);

  return { xpGained, newXp, oldLevel, newLevel, isPb, coinsGained, newCoins, charsTyped, charValue: (CHAR_VALUE_UPGRADES[charLevel] || CHAR_VALUE_UPGRADES[0]).value, newTotalChars };
}

async function getTowerDefenseLeaderboard(limit = 50) {
  const { data, error } = await supabase.rpc('get_td_leaderboard', {
    p_limit: limit
  });

  if (error) {
    console.error('getTowerDefenseLeaderboard error:', error);
    return [];
  }

  return data || [];
}

async function upgradeCharValue(userId) {
  const { data, error } = await supabase.rpc('upgrade_char_value', {
    p_user_id: userId
  });
  if (error) {
    console.error('upgradeCharValue RPC error:', error);
    return { success: false, error: 'Database error' };
  }
  return data || { success: false, error: 'Unknown error' };
}

module.exports = {
  supabase, findUserById, findUserByUsername, checkUsernameExists,
  updateStats, updateXpOnly, updateEmail, xpToLevel, PLACEMENT_GAMES,
  saveAscendRun, getWeeklyLeaderboard, getUserBestHeight,
  saveMatchResult, getMatchHistory, getLeaderboard, getUserAscendStats,
  saveTimeTrialRun, getTimeTrialLeaderboard, getUserTimeTrialStats,
  computeMoneyFromChars, addCoins, CHAR_VALUE_UPGRADES, upgradeCharValue,
  getShopItems, getUserInventory, getUserEquipped, getUserEquippedWithItems,
  purchaseItem, equipItem, unequipItem,
  getUserDailyChallenges, updateChallengeProgress,
  getUserWeeklyChallenges, updateWeeklyChallengeProgress,
  saveTowerDefenseRun, getTowerDefenseLeaderboard
};
