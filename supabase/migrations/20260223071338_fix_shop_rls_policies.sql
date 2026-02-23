-- Fix missing RLS policies for shop system
-- shop_items is public catalog data - allow anyone to read it
ALTER TABLE shop_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access on shop_items"
  ON shop_items FOR SELECT
  TO public
  USING (true);

-- user_inventory: users can only read their own items
ALTER TABLE user_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own inventory"
  ON user_inventory FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on user_inventory"
  ON user_inventory FOR ALL
  TO service_role
  USING (true);

-- user_equipped: users can only read their own equipped items
ALTER TABLE user_equipped ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own equipped"
  ON user_equipped FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on user_equipped"
  ON user_equipped FOR ALL
  TO service_role
  USING (true);
