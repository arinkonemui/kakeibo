# AGENT_LOG（追記専用）

---

## 2026-02-12T13:30+09:00 — Phase 1 / Step 1: GET /api/monthly 実装

### 目的
月間データセット取得API（読み取り専用）を Cloudflare Workers + D1 で実装する。

### 変更ファイル
- `package.json` — 新規作成（osaihu-note, wrangler/typescript/workers-types）
- `tsconfig.json` — 新規作成（ES2022, Workers向け設定）
- `src/index.ts` — 新規作成（Worker本体, GET /api/monthly エンドポイント）
- `docs/AGENT_LOG.md` — 新規作成（本ログ）

### 主要な設計判断

1. **クエリ数: 4並列**
   - months（1行 or null）, categories（ユーザー全件）, entries（月分全件）, daily_budgets（月分全件）
   - `Promise.all` で4クエリを並列実行し、DB往復を最小化
   - DB_SCHEMA.md §3.1 の設計意図に一致

2. **categories は active + inactive 両方を返す**
   - クライアント側で表示フィルタ（is_active=1 のみ月間表に表示）する想定
   - 月ごとにカテゴリを再取得しなくて済むよう、ユーザー全カテゴリを返す

3. **ソート順**
   - categories: `sort_order ASC NULLS LAST, name ASC`（CASE式で NULL を後方に）
   - entries: `date ASC, created_at ASC`（同一日内は入力順）
   - daily_budgets: `date ASC`

4. **monthが存在しない場合**
   - month=null を返し、categories/entries/daily_budgets は空配列
   - クライアントは初回保存時にmonth行を作成する想定

5. **バリデーション**
   - month_key: `/^\d{4}-(0[1-9]|1[0-2])$/` で厳密チェック
   - user_id: 非空チェック
   - 不正時は 400 + JSON error

6. **wrangler.toml はコミットしない**
   - .gitignore に含まれている。wrangler.toml.example を参照用に維持。

### 動作確認

- `npx tsc --noEmit` — 型エラーなし ✓
- ローカル動作確認手順は下記「検証方法」参照

### 検証方法

```bash
# ローカル起動（wrangler.toml に D1 binding が設定済みの前提）
npx wrangler dev

# D1テーブル作成（初回のみ）
npx wrangler d1 execute kakeibo --local --file=db/schema.sql

# 正常リクエスト
curl "http://localhost:8787/api/monthly?user_id=test-user&month_key=2026-02"

# バリデーションエラー（month_key不正）
curl "http://localhost:8787/api/monthly?user_id=test-user&month_key=2026-2"

# バリデーションエラー（user_id欠落）
curl "http://localhost:8787/api/monthly?month_key=2026-02"
```

### レスポンス形状（例）

```json
{
  "month": {
    "user_id": "test-user",
    "month_key": "2026-02",
    "version": 0,
    "monthly_budget": 200000,
    "cutoff_type": "calendar",
    "cutoff_day": null,
    "updated_at": "2026-02-01T00:00:00"
  },
  "categories": [
    {
      "category_id": "cat-001",
      "user_id": "test-user",
      "name": "食費",
      "kind": "expense",
      "is_active": 1,
      "sort_order": 1,
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "entries": [
    {
      "entry_id": "entry-001",
      "user_id": "test-user",
      "month_key": "2026-02",
      "date": "2026-02-01",
      "type": "expense",
      "amount": 500,
      "category_id": "cat-001",
      "memo": "コンビニ",
      "payment_method": "現金",
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "daily_budgets": [
    {
      "user_id": "test-user",
      "month_key": "2026-02",
      "date": "2026-02-01",
      "daily_budget_override": 5000,
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

month が存在しない場合:
```json
{
  "month": null,
  "categories": [],
  "entries": [],
  "daily_budgets": []
}
```

エラーレスポンス (400):
```json
{ "error": "month_key must be in YYYY-MM format." }
```

### 残課題 / 次アクション
- 認証（user_id の検証）は未実装。Phase 1 の認証基盤整備で対応予定。
- 保存エンドポイント（POST /api/monthly）は Phase 1 の次ステップで実装。
- クライアント側キャッシュ（LRU 6ヶ月、TTL）は Phase 2 以降。
