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

const PROFILE_COLS = 'id, username, rating, wins, losses, avg_wpm, games_played, xp, best_wpm, last_pb_at';
const PROFILE_COLS_EMAIL = 'id, username, email, rating, wins, losses, avg_wpm, games_played, xp, best_wpm, last_pb_at';

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

  if (error) return null;
  return data;
}

async function updateStats(userId, won, wpm, opponentRating, mode, totalTimeMs) {
  const user = await findUserById(userId);
  if (!user) return null;

  const newGamesPlayed = user.games_played + 1;
  const newAvgWpm = ((user.avg_wpm * user.games_played) + wpm) / newGamesPlayed;

  const K = 32;
  const expected = 1 / (1 + Math.pow(10, ((opponentRating || 1000) - user.rating) / 400));
  const actual = won ? 1 : 0;
  const ratingDelta = Math.round(K * (actual - expected));
  const newRating = Math.max(0, user.rating + ratingDelta);

  const oldLevel = xpToLevel(user.xp || 0);
  const { xpGained, newBestWpm, isPb, pbBonusXp } = computeXpGain(
    mode || 'ranked', totalTimeMs || 0, won, wpm, user.best_wpm, user.last_pb_at
  );
  const newXp = (user.xp || 0) + xpGained;
  const newLevel = xpToLevel(newXp);

  const updatePayload = {
    wins: user.wins + (won ? 1 : 0),
    losses: user.losses + (won ? 0 : 1),
    avg_wpm: newAvgWpm,
    games_played: newGamesPlayed,
    rating: newRating,
    xp: newXp
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

  return { ratingDelta, newRating, xpGained, newXp, oldLevel, newLevel, isPb };
}

async function updateXpOnly(userId, won, wpm, mode, totalTimeMs) {
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

  const updatePayload = {
    xp: newXp,
    games_played: newGamesPlayed,
    avg_wpm: newAvgWpm,
    wins: (user.wins || 0) + (won ? 1 : 0),
    losses: (user.losses || 0) + (won ? 0 : 1)
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

  return { xpGained, newXp, oldLevel, newLevel, isPb };
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

  const { data, error } = await supabase
    .from('ascend_runs')
    .select('user_id, username, height, tier, duration_ms, created_at')
    .gte('created_at', monday.toISOString())
    .order('height', { ascending: false })
    .limit(limit * 3);

  if (error) {
    console.error('getWeeklyLeaderboard error:', error);
    return [];
  }

  const best = new Map();
  for (const row of data) {
    if (!best.has(row.user_id) || row.height > best.get(row.user_id).height) {
      best.set(row.user_id, row);
    }
  }

  return Array.from(best.values())
    .sort((a, b) => b.height - a.height)
    .slice(0, limit);
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
    .select('*')
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
  const { data, error } = await supabase
    .from('ascend_runs')
    .select('user_id, username, height, tier')
    .order('height', { ascending: false })
    .limit(limit * 3);

  if (error) {
    console.error('getAscendLeaderboard error:', error);
    return [];
  }

  const best = new Map();
  for (const row of data || []) {
    if (!best.has(row.user_id) || row.height > best.get(row.user_id).height) {
      best.set(row.user_id, { user_id: row.user_id, username: row.username, height: row.height, tier: row.tier });
    }
  }
  return Array.from(best.values())
    .sort((a, b) => b.height - a.height)
    .slice(0, limit);
}

async function getLeaderboard(category = 'rating', limit = 50) {
  if (category === 'ascend') {
    return getAscendLeaderboard(limit);
  }

  const validCategories = {
    rating: { column: 'rating', ascending: false },
    best_wpm: { column: 'best_wpm', ascending: false },
    wins: { column: 'wins', ascending: false },
    xp: { column: 'xp', ascending: false }
  };

  const config = validCategories[category] || validCategories.rating;

  let query = supabase
    .from('profiles')
    .select('id, username, rating, wins, losses, avg_wpm, games_played, xp, best_wpm');

  if (category === 'wins') {
    query = query.gt('wins', 0);
  } else if (category === 'best_wpm') {
    query = query.gt('best_wpm', 0);
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

module.exports = {
  supabase, findUserById, findUserByUsername,
  updateStats, updateXpOnly, updateEmail, xpToLevel,
  saveAscendRun, getWeeklyLeaderboard, getUserBestHeight,
  saveMatchResult, getMatchHistory, getLeaderboard, getUserAscendStats
};
