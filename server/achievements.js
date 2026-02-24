const ACHIEVEMENTS = [
  { id: 'speed_80', name: 'Quick Fingers', desc: 'Reach 80 WPM in a match', category: 'speed', check: (s) => s.bestWpm >= 80 },
  { id: 'speed_100', name: 'Speedster', desc: 'Reach 100 WPM in a match', category: 'speed', check: (s) => s.bestWpm >= 100 },
  { id: 'speed_120', name: 'Lightning Hands', desc: 'Reach 120 WPM in a match', category: 'speed', check: (s) => s.bestWpm >= 120 },
  { id: 'speed_150', name: 'Untouchable', desc: 'Reach 150 WPM in a match', category: 'speed', check: (s) => s.bestWpm >= 150 },
  { id: 'games_10', name: 'Getting Started', desc: 'Play 10 games', category: 'endurance', check: (s) => s.gamesPlayed >= 10 },
  { id: 'games_100', name: 'Dedicated', desc: 'Play 100 games', category: 'endurance', check: (s) => s.gamesPlayed >= 100 },
  { id: 'games_500', name: 'Veteran', desc: 'Play 500 games', category: 'endurance', check: (s) => s.gamesPlayed >= 500 },
  { id: 'games_1000', name: 'Legend', desc: 'Play 1000 games', category: 'endurance', check: (s) => s.gamesPlayed >= 1000 },
  { id: 'wins_10', name: 'Winner', desc: 'Win 10 matches', category: 'competitive', check: (s) => s.wins >= 10 },
  { id: 'wins_50', name: 'Champion', desc: 'Win 50 matches', category: 'competitive', check: (s) => s.wins >= 50 },
  { id: 'wins_100', name: 'Dominator', desc: 'Win 100 matches', category: 'competitive', check: (s) => s.wins >= 100 },
  { id: 'rank_silver', name: 'Silver League', desc: 'Reach Silver rank', category: 'competitive', check: (s) => s.rating >= 800 },
  { id: 'rank_gold', name: 'Gold League', desc: 'Reach Gold rank', category: 'competitive', check: (s) => s.rating >= 1100 },
  { id: 'rank_platinum', name: 'Platinum League', desc: 'Reach Platinum rank', category: 'competitive', check: (s) => s.rating >= 1400 },
  { id: 'rank_diamond', name: 'Diamond League', desc: 'Reach Diamond rank', category: 'competitive', check: (s) => s.rating >= 1700 },
  { id: 'climb_5', name: 'Mountaineer', desc: 'Reach Tier 5 in Climb', category: 'climb', check: (s) => s.bestClimbTier >= 5 },
  { id: 'climb_8', name: 'Summit Seeker', desc: 'Reach Tier 8 in Climb', category: 'climb', check: (s) => s.bestClimbTier >= 8 },
  { id: 'climb_10', name: 'Peak Performer', desc: 'Reach Tier 10 in Climb', category: 'climb', check: (s) => s.bestClimbTier >= 10 },
  { id: 'coins_10k', name: 'Saver', desc: 'Accumulate 10,000 coins', category: 'economy', check: (s) => s.coins >= 10000 },
  { id: 'coins_100k', name: 'Wealthy', desc: 'Accumulate 100,000 coins', category: 'economy', check: (s) => s.coins >= 100000 },
  { id: 'coins_1m', name: 'Millionaire', desc: 'Accumulate 1,000,000 coins', category: 'economy', check: (s) => s.coins >= 1000000 },
  { id: 'chars_100k', name: 'Typist', desc: 'Type 100,000 characters', category: 'endurance', check: (s) => s.totalCharsTyped >= 100000 },
  { id: 'chars_1m', name: 'Keyboard Warrior', desc: 'Type 1,000,000 characters', category: 'endurance', check: (s) => s.totalCharsTyped >= 1000000 },
  { id: 'td_wave_10', name: 'Defender', desc: 'Survive 10 waves in Defense', category: 'defense', check: (s) => s.bestTdWave >= 10 },
  { id: 'td_wave_20', name: 'Fortress', desc: 'Survive 20 waves in Defense', category: 'defense', check: (s) => s.bestTdWave >= 20 },
];

function getProfileStats(profile, extra = {}) {
  return {
    bestWpm: profile.best_wpm || 0,
    gamesPlayed: profile.games_played || 0,
    wins: profile.wins || 0,
    rating: profile.rating || 1000,
    coins: profile.coins || 0,
    totalCharsTyped: profile.total_chars_typed || 0,
    bestTdWave: profile.best_td_wave || 0,
    bestClimbTier: extra.bestClimbTier || 0,
    ...extra
  };
}

function checkAchievements(stats, existingIds) {
  const newlyUnlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (existingIds.has(a.id)) continue;
    try {
      if (a.check(stats)) {
        newlyUnlocked.push(a);
      }
    } catch (_) {}
  }
  return newlyUnlocked;
}

function getAllAchievements() {
  return ACHIEVEMENTS.map(a => ({ id: a.id, name: a.name, desc: a.desc, category: a.category }));
}

module.exports = { ACHIEVEMENTS, getProfileStats, checkAchievements, getAllAchievements };
