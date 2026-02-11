PRAGMA foreign_keys = ON;

-- users
CREATE TABLE IF NOT EXISTS users (
  user_id     TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- months
CREATE TABLE IF NOT EXISTS months (
  user_id        TEXT NOT NULL,
  month_key      TEXT NOT NULL, -- 'YYYY-MM'
  version        INTEGER NOT NULL DEFAULT 0,
  monthly_budget INTEGER,
  cutoff_type    TEXT NOT NULL DEFAULT 'calendar', -- 'calendar' or 'cutoff'
  cutoff_day     INTEGER, -- 1-28 (cutoff_type='cutoff' の時)
  updated_at     TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (user_id, month_key),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- categories
CREATE TABLE IF NOT EXISTS categories (
  category_id TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'expense', -- 'expense' / 'income' / 'both'
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER,
  created_at  TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at  TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  UNIQUE (user_id, name)
);

-- entries
CREATE TABLE IF NOT EXISTS entries (
  entry_id       TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  month_key      TEXT NOT NULL,
  date           TEXT NOT NULL, -- 'YYYY-MM-DD'
  type           TEXT NOT NULL, -- 'expense' / 'income'
  amount         INTEGER NOT NULL,
  category_id    TEXT NOT NULL,
  memo           TEXT,
  payment_method TEXT, -- 現金/クレカ/銀行引落/QR/その他 or NULL
  created_at     TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at     TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (user_id, month_key) REFERENCES months(user_id, month_key),
  FOREIGN KEY (category_id) REFERENCES categories(category_id)
);

-- daily_budgets
CREATE TABLE IF NOT EXISTS daily_budgets (
  user_id               TEXT NOT NULL,
  month_key             TEXT NOT NULL,
  date                  TEXT NOT NULL,
  daily_budget_override INTEGER NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at            TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (user_id, month_key, date),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (user_id, month_key) REFERENCES months(user_id, month_key)
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_entries_user_month_date
  ON entries(user_id, month_key, date);

CREATE INDEX IF NOT EXISTS idx_entries_user_month_type
  ON entries(user_id, month_key, type);

CREATE INDEX IF NOT EXISTS idx_categories_user_sort
  ON categories(user_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_daily_budgets_user_month
  ON daily_budgets(user_id, month_key);
