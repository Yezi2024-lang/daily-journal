-- ═══════════════════════════════════════════
-- 每日记录 — Supabase 数据库迁移脚本
-- ═══════════════════════════════════════════
-- 使用方法：
--   1. 打开 Supabase 控制台 → SQL Editor
--   2. 粘贴此文件全部内容
--   3. 点击 Run 执行

-- ── 创建日记条目表 ──
CREATE TABLE IF NOT EXISTS journal_entries (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date        DATE NOT NULL,
  happy       TEXT DEFAULT '',
  unhappy     TEXT DEFAULT '',
  think       TEXT DEFAULT '',
  rating      INTEGER DEFAULT 0 CHECK (rating >= 0 AND rating <= 10),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

-- ── 创建索引 ──
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_id ON journal_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date);

-- ── 开启 Row Level Security ──
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

-- ── RLS 策略：用户只能读写自己的数据 ──
-- 删除可能已存在的策略（幂等运行）
DROP POLICY IF EXISTS "own_data_select" ON journal_entries;
DROP POLICY IF EXISTS "own_data_insert" ON journal_entries;
DROP POLICY IF EXISTS "own_data_update" ON journal_entries;
DROP POLICY IF EXISTS "own_data_delete" ON journal_entries;

-- SELECT: 只能查看自己的条目
CREATE POLICY "own_data_select" ON journal_entries
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: 只能插入自己的条目
CREATE POLICY "own_data_insert" ON journal_entries
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: 只能更新自己的条目
CREATE POLICY "own_data_update" ON journal_entries
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: 只能删除自己的条目
CREATE POLICY "own_data_delete" ON journal_entries
  FOR DELETE
  USING (auth.uid() = user_id);

-- ── 自动设置 user_id ──
-- 通过触发器自动填充 user_id，前端无需手动传
CREATE OR REPLACE FUNCTION set_journal_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_journal_entries_user_id ON journal_entries;
CREATE TRIGGER trg_journal_entries_user_id
  BEFORE INSERT ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION set_journal_user_id();
