# DB_SCHEMA（Cloudflare D1 / SQLite）

本ドキュメントは D1 のスキーマ設計書（AI/実装者向け）です。  
**db/schema.sql がソースオブトゥルース**であり、DB変更は schema.sql（または将来 migrations）と本ドキュメントを同期させる。

- DB: Cloudflare D1（SQLite互換）
- 目的: 家計簿データをユーザー単位で分離し、月単位の取得・キャッシュ・差分保存・競合検出を成立させる
- 重要: `months.version` を保存時の競合検出（楽観ロック）に使う

---

## 1. 共通ルール

### 1.1 ID
- `users.user_id`：認証基盤に依存（外部IDでもOK）。ユニークな文字列。
- `categories.category_id` / `entries.entry_id`：UUIDなどのユニークID（TEXT）

### 1.2 日付キー
- `month_key`: `YYYY-MM` 形式（例: `2026-02`）
- `date`: `YYYY-MM-DD` 形式

### 1.3 参照整合性
- 外部キー制約を想定（実装側は必要に応じて `PRAGMA foreign_keys = ON;` を実行）
- 親テーブル（users / months / categories）に存在しない参照は許可しない

### 1.4 インデックス方針
- 「月表示 = 1ヶ月データセット取得」が基本なので、
  `entries(user_id, month_key, date)` を最重要インデックスとする

---

## 2. テーブル一覧

### 2.1 users
ユーザー識別。全データは user_id で完全分離。

| Column | Type | Null | Key | Default | Note |
|---|---|---:|---|---|---|
| user_id | TEXT | NO | PK | - | ユーザーID |
| created_at | TEXT | NO |  | CURRENT_TIMESTAMP | 作成日時 |

#### Constraints
- PK: `(user_id)`

---

### 2.2 months
ユーザー×月のヘッダ。月予算・締め情報・競合検出用versionを保持。

| Column | Type | Null | Key | Default | Note |
|---|---|---:|---|---|---|
| user_id | TEXT | NO | PK(複合) / FK | - | users.user_id |
| month_key | TEXT | NO | PK(複合) | - | `YYYY-MM` |
| version | INTEGER | NO |  | 0 | 競合検出（楽観ロック） |
| monthly_budget | INTEGER | YES |  | - | 月予算（円） |
| cutoff_type | TEXT | NO |  | 'calendar' | 'calendar' or 'cutoff' |
| cutoff_day | INTEGER | YES |  | - | 1〜28想定（cutoff_type='cutoff'のみ） |
| updated_at | TEXT | NO |  | CURRENT_TIMESTAMP | 更新日時 |

#### Constraints
- PK: `(user_id, month_key)`
- FK: `user_id -> users.user_id`

#### Semantics
- 画面で当月を開くとき、まずこの行を取得する（versionを含む）
- 保存時は `months.version` の一致を必須とし、不一致なら保存拒否

---

### 2.3 categories
ユーザー別カテゴリ。階層なし。表示順（sort_order）を持つ。

| Column | Type | Null | Key | Default | Note |
|---|---|---:|---|---|---|
| category_id | TEXT | NO | PK | - | UUID等 |
| user_id | TEXT | NO | FK | - | users.user_id |
| name | TEXT | NO | UNIQUE(複合) | - | 同一user内で一意 |
| kind | TEXT | NO |  | 'expense' | 'expense'/'income'/'both'（運用で選択） |
| is_active | INTEGER | NO |  | 1 | 0/1 |
| sort_order | INTEGER | YES |  | - | 表示順 |
| created_at | TEXT | NO |  | CURRENT_TIMESTAMP | 作成日時 |
| updated_at | TEXT | NO |  | CURRENT_TIMESTAMP | 更新日時 |

#### Constraints
- PK: `(category_id)`
- FK: `user_id -> users.user_id`
- UNIQUE: `(user_id, name)`

#### Indexes
- `idx_categories_user_sort (user_id, sort_order)`

---

### 2.4 entries
明細（支出/収入）。月画面表示の主データ。

| Column | Type | Null | Key | Default | Note |
|---|---|---:|---|---|---|
| entry_id | TEXT | NO | PK | - | UUID等 |
| user_id | TEXT | NO | FK | - | users.user_id |
| month_key | TEXT | NO | FK(複合) | - | months(user_id, month_key) |
| date | TEXT | NO |  | - | `YYYY-MM-DD` |
| type | TEXT | NO |  | - | 'expense' or 'income' |
| amount | INTEGER | NO |  | - | 円（正の整数想定） |
| category_id | TEXT | NO | FK | - | categories.category_id |
| memo | TEXT | YES |  | - | メモ |
| payment_method | TEXT | YES |  | - | 現金/クレカ/銀行引落/QR/その他 or NULL |
| created_at | TEXT | NO |  | CURRENT_TIMESTAMP | 作成日時 |
| updated_at | TEXT | NO |  | CURRENT_TIMESTAMP | 更新日時 |

#### Constraints
- PK: `(entry_id)`
- FK: `user_id -> users.user_id`
- FK(複合): `(user_id, month_key) -> months(user_id, month_key)`
- FK: `category_id -> categories.category_id`

#### Indexes
- `idx_entries_user_month_date (user_id, month_key, date)`
- `idx_entries_user_month_type (user_id, month_key, type)`

#### Semantics
- 月間表は「支出のみ表示」だが、entriesには収入も格納する（typeで判別）
- 月表示は `(user_id, month_key)` で全件取得し、UI側で集計する

---

### 2.5 daily_budgets
日予算の上書き。上書きがある日だけ保持（存在しない日はデフォルト計算）。

| Column | Type | Null | Key | Default | Note |
|---|---|---:|---|---|---|
| user_id | TEXT | NO | PK(複合) / FK | - | users.user_id |
| month_key | TEXT | NO | PK(複合) / FK(複合) | - | months(user_id, month_key) |
| date | TEXT | NO | PK(複合) | - | `YYYY-MM-DD` |
| daily_budget_override | INTEGER | NO |  | - | 上書き日予算（円） |
| created_at | TEXT | NO |  | CURRENT_TIMESTAMP | 作成日時 |
| updated_at | TEXT | NO |  | CURRENT_TIMESTAMP | 更新日時 |

#### Constraints
- PK: `(user_id, month_key, date)`
- FK: `user_id -> users.user_id`
- FK(複合): `(user_id, month_key) -> months(user_id, month_key)`

#### Indexes
- `idx_daily_budgets_user_month (user_id, month_key)`

#### Semantics
- 日予算合計 > 月予算 の警告はUI側で計算し表示
- デフォルト日予算は「月予算 ÷ 月の日数（切り捨て）」で算出

---

## 3. 代表クエリ（設計意図確認用）

### 3.1 月データセット取得（推奨：1回で揃える）
- months（version含む）
- categories
- entries
- daily_budgets

（実装では並列取得 or 1エンドポイントでまとめて返却）

### 3.2 競合チェック付き保存（概念）
- 保存要求に含まれる `expected_version` と `months.version` を一致条件にする
- 一致しない場合は保存拒否して「最新取得→再編集」を促す

---

## 4. 変更管理
- schema変更は db/schema.sql と docs/DB_SCHEMA.md を同時更新
- 変更理由・影響は docs/AGENT_LOG.md に追記する
