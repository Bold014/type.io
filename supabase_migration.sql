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

-- 8. Seed shop items (exponential pricing within each category)
INSERT INTO shop_items (id, category, name, price, data, sort_order, level_required) VALUES
  -- Username Colors (~1.6x multiplier per tier)
  ('color_crimson',  'username_color', 'Crimson',   100, '{"hex":"#ef4444"}', 1, 0),
  ('color_sunset',   'username_color', 'Sunset',    175, '{"hex":"#f97316"}', 2, 0),
  ('color_gold',     'username_color', 'Gold',      300, '{"hex":"#eab308"}', 3, 0),
  ('color_emerald',  'username_color', 'Emerald',   500, '{"hex":"#22c55e"}', 4, 0),
  ('color_cyan',     'username_color', 'Cyan',      850, '{"hex":"#06b6d4"}', 5, 0),
  ('color_royal',    'username_color', 'Royal',    1400, '{"hex":"#3b82f6"}', 6, 0),
  ('color_violet',   'username_color', 'Violet',   2400, '{"hex":"#8b5cf6"}', 7, 0),
  ('color_pink',     'username_color', 'Pink',     4000, '{"hex":"#ec4899"}', 8, 0),
  -- Cursor Skins (~2.5x multiplier per tier)
  ('cursor_block',     'cursor_skin', 'Block',      150, '{"style":"block"}',     1, 0),
  ('cursor_underline', 'cursor_skin', 'Underline',  400, '{"style":"underline"}', 2, 0),
  ('cursor_line',      'cursor_skin', 'Line',      1000, '{"style":"line"}',      3, 5),
  ('cursor_dot',       'cursor_skin', 'Dot',       2500, '{"style":"dot"}',       4, 10),
  -- Badges (~2.3x multiplier per tier, ordered by level)
  ('badge_star',      'badge', 'Star',       200, '{"icon":"star"}',      1, 0),
  ('badge_heart',     'badge', 'Heart',      500, '{"icon":"heart"}',     2, 0),
  ('badge_lightning', 'badge', 'Lightning', 1200, '{"icon":"lightning"}', 3, 5),
  ('badge_crown',     'badge', 'Crown',     2800, '{"icon":"crown"}',    4, 10),
  ('badge_flame',     'badge', 'Flame',     6500, '{"icon":"flame"}',    5, 15),
  ('badge_skull',     'badge', 'Skull',    15000, '{"icon":"skull"}',    6, 20),
  -- Titles (~1.8x multiplier per tier, ordered by level)
  ('title_speedster',         'title', 'Speedster',          400, '{"text":"Speedster"}',         1, 5),
  ('title_word_smith',        'title', 'Word Smith',         750, '{"text":"Word Smith"}',        2, 5),
  ('title_ghost',             'title', 'Ghost',             1400, '{"text":"Ghost"}',             3, 10),
  ('title_iron_fingers',      'title', 'Iron Fingers',      2500, '{"text":"Iron Fingers"}',      4, 10),
  ('title_the_machine',       'title', 'The Machine',       4500, '{"text":"The Machine"}',       5, 15),
  ('title_keyboard_warrior',  'title', 'Keyboard Warrior',  8000, '{"text":"Keyboard Warrior"}',  6, 15),
  ('title_untouchable',       'title', 'Untouchable',      14000, '{"text":"Untouchable"}',       7, 20),
  ('title_type_god',          'title', 'Type God',         25000, '{"text":"Type God"}',          8, 25),
  -- Chat Emotes (~2.2x multiplier per tier, ordered by level)
  ('emote_gg',      'chat_emote', 'gg',         50, '{"text":"gg"}',        1, 0),
  ('emote_nice',    'chat_emote', 'nice',       125, '{"text":"nice"}',      2, 0),
  ('emote_close',   'chat_emote', 'close one',  300, '{"text":"close one"}', 3, 0),
  ('emote_rematch', 'chat_emote', 'rematch?',   700, '{"text":"rematch?"}',  4, 0),
  ('emote_easy',    'chat_emote', 'too easy',  1600, '{"text":"too easy"}',  5, 5),
  ('emote_wow',     'chat_emote', 'wow',       3500, '{"text":"wow"}',       6, 5)
ON CONFLICT (id) DO UPDATE SET
  price = EXCLUDED.price,
  sort_order = EXCLUDED.sort_order;

-- 9. Index for fast inventory/equipped lookups
CREATE INDEX IF NOT EXISTS idx_user_inventory_user ON user_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_user_equipped_user ON user_equipped(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_challenges_user_date ON daily_challenges(user_id, date);

-- 10. Tower Defense runs
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

-- 11. Tower Defense leaderboard RPC
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
