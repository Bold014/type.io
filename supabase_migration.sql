-- ============================================================
-- TypeDuel.io - Currency & Shop System Migration
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Add coins and daily-win tracking to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coins integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_daily_win date;

-- 2. Shop items catalog
CREATE TABLE IF NOT EXISTS shop_items (
  id text PRIMARY KEY,
  category text NOT NULL,
  name text NOT NULL,
  price integer NOT NULL,
  data jsonb DEFAULT '{}',
  sort_order integer DEFAULT 0,
  level_required integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- 3. User inventory (owned items)
CREATE TABLE IF NOT EXISTS user_inventory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  item_id text REFERENCES shop_items(id) ON DELETE CASCADE,
  purchased_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, item_id)
);

-- 4. User equipped items (one per category)
CREATE TABLE IF NOT EXISTS user_equipped (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  category text NOT NULL,
  item_id text REFERENCES shop_items(id) ON DELETE CASCADE,
  UNIQUE(user_id, category)
);

-- 5. Daily challenges
CREATE TABLE IF NOT EXISTS daily_challenges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  challenge_type text NOT NULL,
  target integer NOT NULL,
  progress integer DEFAULT 0,
  coin_reward integer NOT NULL,
  completed boolean DEFAULT false,
  date date NOT NULL,
  UNIQUE(user_id, challenge_type, date)
);

-- 6. RPC: Atomic coin increment
CREATE OR REPLACE FUNCTION add_coins(p_user_id uuid, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_balance integer;
BEGIN
  UPDATE profiles
  SET coins = COALESCE(coins, 0) + p_amount
  WHERE id = p_user_id
  RETURNING coins INTO v_new_balance;
  RETURN COALESCE(v_new_balance, 0);
END;
$$;

-- 7. RPC: Atomic shop purchase
CREATE OR REPLACE FUNCTION purchase_shop_item(p_user_id uuid, p_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_price integer;
  v_level_required integer;
  v_coins integer;
  v_already_owned boolean;
BEGIN
  SELECT price, level_required INTO v_price, v_level_required
  FROM shop_items WHERE id = p_item_id;

  IF v_price IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item not found');
  END IF;

  SELECT coins INTO v_coins
  FROM profiles WHERE id = p_user_id;

  IF v_coins IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_inventory WHERE user_id = p_user_id AND item_id = p_item_id
  ) INTO v_already_owned;

  IF v_already_owned THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already owned');
  END IF;

  IF v_coins < v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not enough coins');
  END IF;

  UPDATE profiles SET coins = coins - v_price WHERE id = p_user_id;

  INSERT INTO user_inventory (user_id, item_id) VALUES (p_user_id, p_item_id);

  RETURN jsonb_build_object('success', true, 'newBalance', v_coins - v_price);
END;
$$;

-- 8. Seed shop items (rebalanced for character-based $money economy)
INSERT INTO shop_items (id, category, name, price, data, sort_order, level_required) VALUES
  -- Username Colors (solid)
  ('color_crimson',  'username_color', 'Crimson',    1000, '{"hex":"#ef4444"}', 1, 0),
  ('color_sunset',   'username_color', 'Sunset',     5000, '{"hex":"#f97316"}', 2, 0),
  ('color_gold',     'username_color', 'Gold',      10000, '{"hex":"#eab308"}', 3, 0),
  ('color_emerald',  'username_color', 'Emerald',   20000, '{"hex":"#22c55e"}', 4, 0),
  ('color_cyan',     'username_color', 'Cyan',      40000, '{"hex":"#06b6d4"}', 5, 5),
  ('color_royal',    'username_color', 'Royal',     75000, '{"hex":"#3b82f6"}', 6, 5),
  ('color_violet',   'username_color', 'Violet',   150000, '{"hex":"#8b5cf6"}', 7, 10),
  ('color_pink',     'username_color', 'Pink',     300000, '{"hex":"#ec4899"}', 8, 10),
  -- Gradient Colors (two-tone)
  ('grad_sunset_fade', 'username_gradient', 'Sunset Fade',  100000, '{"from":"#f97316","to":"#ec4899"}', 1, 10),
  ('grad_ocean_depth', 'username_gradient', 'Ocean Depth',  100000, '{"from":"#3b82f6","to":"#06b6d4"}', 2, 10),
  ('grad_aurora',      'username_gradient', 'Aurora',       250000, '{"from":"#22c55e","to":"#8b5cf6"}', 3, 15),
  ('grad_lava',        'username_gradient', 'Lava',         250000, '{"from":"#ef4444","to":"#eab308"}', 4, 15),
  ('grad_twilight',    'username_gradient', 'Twilight',     500000, '{"from":"#8b5cf6","to":"#1e3a5f"}', 5, 20),
  ('grad_gold_rush',   'username_gradient', 'Gold Rush',    500000, '{"from":"#eab308","to":"#ffffff"}', 6, 20),
  ('grad_toxic',       'username_gradient', 'Toxic',       1000000, '{"from":"#22c55e","to":"#d4ff00"}', 7, 25),
  ('grad_void',        'username_gradient', 'Void',        2000000, '{"from":"#6b21a8","to":"#0a0a0a"}', 8, 30),
  -- Name Effects (premium)
  ('effect_glow',      'name_effect', 'Glow',         50000, '{"effect":"glow"}',      1, 5),
  ('effect_pulse',     'name_effect', 'Pulse',        150000, '{"effect":"pulse"}',     2, 10),
  ('effect_neon',      'name_effect', 'Neon',         400000, '{"effect":"neon"}',      3, 15),
  ('effect_rainbow',   'name_effect', 'Rainbow',     1000000, '{"effect":"rainbow"}',   4, 20),
  ('effect_fire',      'name_effect', 'Fire',        2500000, '{"effect":"fire"}',      5, 25),
  ('effect_ice',       'name_effect', 'Ice',         2500000, '{"effect":"ice"}',       6, 25),
  ('effect_glitch',    'name_effect', 'Glitch',      5000000, '{"effect":"glitch"}',    7, 30),
  ('effect_chromatic', 'name_effect', 'Chromatic',  10000000, '{"effect":"chromatic"}', 8, 35),
  -- Cursor Skins
  ('cursor_block',     'cursor_skin', 'Block',       2000, '{"style":"block"}',     1, 0),
  ('cursor_underline', 'cursor_skin', 'Underline',   8000, '{"style":"underline"}', 2, 0),
  ('cursor_line',      'cursor_skin', 'Line',       25000, '{"style":"line"}',      3, 5),
  ('cursor_dot',       'cursor_skin', 'Dot',        75000, '{"style":"dot"}',       4, 10),
  -- Badges
  ('badge_star',           'badge', 'Star',            3000, '{"icon":"star"}',           1, 0),
  ('badge_heart',          'badge', 'Heart',          10000, '{"icon":"heart"}',          2, 0),
  ('badge_lightning',      'badge', 'Lightning',      30000, '{"icon":"lightning"}',      3, 5),
  ('badge_crown',          'badge', 'Crown',          80000, '{"icon":"crown"}',          4, 10),
  ('badge_flame',          'badge', 'Flame',         200000, '{"icon":"flame"}',          5, 15),
  ('badge_skull',          'badge', 'Skull',         500000, '{"icon":"skull"}',          6, 20),
  ('badge_flame_animated', 'badge', 'Animated Flame', 750000, '{"icon":"flame","animated":true}', 7, 20),
  ('badge_crown_animated', 'badge', 'Animated Crown',1500000, '{"icon":"crown","animated":true}', 8, 25),
  ('badge_diamond',        'badge', 'Diamond',       3000000, '{"icon":"diamond","animated":true}', 9, 30),
  -- Titles
  ('title_speedster',         'title', 'Speedster',           5000, '{"text":"Speedster"}',         1, 5),
  ('title_word_smith',        'title', 'Word Smith',         15000, '{"text":"Word Smith"}',        2, 5),
  ('title_ghost',             'title', 'Ghost',              35000, '{"text":"Ghost"}',             3, 10),
  ('title_iron_fingers',      'title', 'Iron Fingers',       75000, '{"text":"Iron Fingers"}',      4, 10),
  ('title_the_machine',       'title', 'The Machine',       150000, '{"text":"The Machine"}',       5, 15),
  ('title_keyboard_warrior',  'title', 'Keyboard Warrior',  300000, '{"text":"Keyboard Warrior"}',  6, 15),
  ('title_untouchable',       'title', 'Untouchable',       600000, '{"text":"Untouchable"}',       7, 20),
  ('title_type_god',          'title', 'Type God',         1000000, '{"text":"Type God"}',          8, 25),
  ('title_transcendent',      'title', 'Transcendent',     2000000, '{"text":"Transcendent"}',      9, 30),
  ('title_the_one',           'title', 'The One',          5000000, '{"text":"The One"}',           10, 35),
  ('title_goat',              'title', 'GOAT',            10000000, '{"text":"GOAT"}',              11, 40),
  -- Chat Emotes
  ('emote_gg',      'chat_emote', 'gg',          500, '{"text":"gg"}',        1, 0),
  ('emote_nice',    'chat_emote', 'nice',       2000, '{"text":"nice"}',      2, 0),
  ('emote_close',   'chat_emote', 'close one',  5000, '{"text":"close one"}', 3, 0),
  ('emote_rematch', 'chat_emote', 'rematch?',  15000, '{"text":"rematch?"}',  4, 0),
  ('emote_easy',    'chat_emote', 'too easy',  40000, '{"text":"too easy"}',  5, 5),
  ('emote_wow',     'chat_emote', 'wow',      100000, '{"text":"wow"}',       6, 5)
ON CONFLICT (id) DO UPDATE SET
  price = EXCLUDED.price,
  data = EXCLUDED.data,
  sort_order = EXCLUDED.sort_order,
  level_required = EXCLUDED.level_required;

-- 9. Index for fast inventory/equipped lookups
CREATE INDEX IF NOT EXISTS idx_user_inventory_user ON user_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_user_equipped_user ON user_equipped(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_challenges_user_date ON daily_challenges(user_id, date);

-- 10. Weekly challenges
CREATE TABLE IF NOT EXISTS weekly_challenges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  challenge_type text NOT NULL,
  target integer NOT NULL,
  progress integer DEFAULT 0,
  coin_reward integer NOT NULL,
  completed boolean DEFAULT false,
  week_start date NOT NULL,
  UNIQUE(user_id, challenge_type, week_start)
);
CREATE INDEX IF NOT EXISTS idx_weekly_challenges_user_week ON weekly_challenges(user_id, week_start);

-- 11. Tower Defense runs
CREATE TABLE IF NOT EXISTS tower_defense_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  username text NOT NULL,
  waves_survived integer NOT NULL,
  enemies_killed integer NOT NULL,
  score integer NOT NULL,
  accuracy numeric,
  duration_ms integer,
  created_at timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_td_runs_user ON tower_defense_runs(user_id);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS best_td_wave integer DEFAULT 0;

-- 12. Cookie Clicker economy columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_chars_typed bigint DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS char_value_level integer DEFAULT 0;

-- 13. RPC: Atomic character value upgrade
CREATE OR REPLACE FUNCTION upgrade_char_value(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_level integer;
  v_coins integer;
  v_cost integer;
  v_costs integer[] := ARRAY[0, 500, 2000, 8000, 30000, 100000, 350000, 1000000, 3000000, 10000000];
BEGIN
  SELECT char_value_level, coins INTO v_level, v_coins
  FROM profiles WHERE id = p_user_id;

  IF v_level IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_level >= array_length(v_costs, 1) - 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already max level');
  END IF;

  v_cost := v_costs[v_level + 2];

  IF v_coins < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not enough money');
  END IF;

  UPDATE profiles
  SET coins = coins - v_cost, char_value_level = char_value_level + 1
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'newLevel', v_level + 1,
    'newBalance', v_coins - v_cost
  );
END;
$$;

-- 14. Tower Defense leaderboard RPC
CREATE OR REPLACE FUNCTION get_td_leaderboard(p_limit integer)
RETURNS TABLE(username text, waves_survived integer, score integer, enemies_killed integer)
LANGUAGE sql STABLE
AS $$
  SELECT sub.username, sub.waves_survived, sub.score, sub.enemies_killed
  FROM (
    SELECT DISTINCT ON (t.user_id) t.username, t.waves_survived, t.score, t.enemies_killed
    FROM tower_defense_runs t
    ORDER BY t.user_id, t.score DESC
  ) sub
  ORDER BY sub.score DESC
  LIMIT p_limit;
$$;

-- 15. RPC: Safe coin deduction (only deducts if balance >= amount)
CREATE OR REPLACE FUNCTION deduct_coins_safe(p_user_id uuid, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_balance integer;
BEGIN
  UPDATE profiles
  SET coins = coins - p_amount
  WHERE id = p_user_id AND coins >= p_amount
  RETURNING coins INTO v_new_balance;
  IF NOT FOUND THEN RETURN -1; END IF;
  RETURN v_new_balance;
END;
$$;

-- ============================================================
-- 16. RLS policies for daily_challenges & weekly_challenges
-- Run this to fix "row-level security policy" insert errors
-- ============================================================

-- daily_challenges
ALTER TABLE daily_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on daily_challenges"
  ON daily_challenges FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can view own daily challenges"
  ON daily_challenges FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily challenges"
  ON daily_challenges FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily challenges"
  ON daily_challenges FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- weekly_challenges
ALTER TABLE weekly_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on weekly_challenges"
  ON weekly_challenges FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can view own weekly challenges"
  ON weekly_challenges FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own weekly challenges"
  ON weekly_challenges FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own weekly challenges"
  ON weekly_challenges FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
