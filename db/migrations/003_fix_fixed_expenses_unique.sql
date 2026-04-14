-- Migration 003: fixed_expenses の UNIQUE 制約に entry_type を追加
-- 旧: UNIQUE (user_id, month_key, name)
-- 新: UNIQUE (user_id, month_key, entry_type, name)
-- SQLite は UNIQUE 制約の変更ができないため、テーブルを再作成する

PRAGMA foreign_keys = OFF;

CREATE TABLE fixed_expenses_new (
  fixed_expense_id TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  month_key        TEXT NOT NULL,
  entry_type       TEXT NOT NULL DEFAULT 'expense',
  name             TEXT NOT NULL,
  icon_key         TEXT NOT NULL DEFAULT 'custom',
  amount           INTEGER NOT NULL DEFAULT 0,
  is_default       INTEGER NOT NULL DEFAULT 0,
  sort_order       INTEGER,
  created_at       TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at       TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (user_id, month_key, entry_type, name)
);

INSERT INTO fixed_expenses_new
  SELECT fixed_expense_id, user_id, month_key, entry_type, name, icon_key,
         amount, is_default, sort_order, created_at, updated_at
  FROM fixed_expenses;

DROP TABLE fixed_expenses;

ALTER TABLE fixed_expenses_new RENAME TO fixed_expenses;

CREATE INDEX IF NOT EXISTS idx_fixed_expenses_user_month
  ON fixed_expenses(user_id, month_key);

PRAGMA foreign_keys = ON;
