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
  let newBestWpm = currentBestWpm || 0;

  if (wpm > newBestWpm) {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastPb = lastPbAt ? new Date(lastPbAt) : null;

    if (!lastPb || lastPb < oneDayAgo) {
      xpGained += 500;
      isPb = true;
      newBestWpm = wpm;
    }
  }

  return { xpGained, newBestWpm, isPb };
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
  const { xpGained, newBestWpm, isPb } = computeXpGain(
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
  const { xpGained, newBestWpm, isPb } = computeXpGain(
    mode || 'quick', totalTimeMs || 0, won, wpm, user.best_wpm, user.last_pb_at
  );
  const newXp = (user.xp || 0) + xpGained;
  const newLevel = xpToLevel(newXp);

  const updatePayload = { xp: newXp };

  if (isPb) {
    updatePayload.best_wpm = newBestWpm;
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

module.exports = {
  supabase, findUserById, findUserByUsername,
  updateStats, updateXpOnly, updateEmail, xpToLevel
};
