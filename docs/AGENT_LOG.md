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

---

## 2026-02-12T14:00+09:00 — Phase 1 / Step 2-Auth: 認証基盤の実装

### 目的
APIリクエストの user_id をクエリパラメータ（信頼できない）から認証ベース（信頼できるソース）に移行する。

### 変更ファイル
- `src/auth.ts` — 新規作成（認証ヘルパー: dev / prod 2モード）
- `src/index.ts` — 変更（auth統合、user_id をクエリパラメータから取得しない構造に変更）
- `wrangler.toml.example` — 変更（AUTH_SECRET / DEV_MODE の設定例追加）
- `docs/AGENT_LOG.md` — 追記（本エントリ）

### 主要な設計判断

1. **本番認証方式: Option 2（HMAC署名トークン）を選択**
   - 理由:
     - Cloudflare Accessのサブスクリプション/セットアップが不要
     - Workers内で完結（Web Crypto API使用）、外部依存なし
     - MVP段階で最も軽量
     - 将来Cloudflare Access（Option 1）への移行も容易
   - トークン形式: `base64url(payload).base64url(HMAC-SHA256)`
   - ペイロード: `{ "sub": "<user_id>", "exp": <unix_seconds> }`
   - シークレットは環境変数 `AUTH_SECRET` で設定（`wrangler secret` 推奨）

2. **開発モード: `X-Debug-User` ヘッダー**
   - `DEV_MODE` 環境変数が truthy な場合のみ有効
   - wrangler.toml（ローカル）で `[vars] DEV_MODE = "true"` を設定
   - 本番デプロイでは DEV_MODE を設定しない → デバッグヘッダー無効

3. **user_id のソース変更**
   - 変更前: クエリパラメータ `?user_id=xxx`（クライアントが自由に指定可能）
   - 変更後: 認証ヘッダーから導出（サーバー側で検証済み）
   - `validateMonthlyParams` → `validateMonthKey` にリネーム（user_id バリデーション不要に）

4. **認証で追加DBクエリなし**
   - トークン検証は純粋な暗号処理（Web Crypto API）のみ
   - DBアクセス最小化ルールに準拠

5. **エラーレスポンス**
   - 401: 認証なし / トークン無効 / 期限切れ
   - 400: month_key 不正 / トークン形式不正
   - 404: 不明なパス
   - 内部用語は露出しない

### 動作確認

```bash
# 型チェック
npx tsc --noEmit  # エラーなし ✓

# ローカル起動（DEV_MODE=true）
npx wrangler dev

# Test 1: X-Debug-User ヘッダーあり → 200 + データ返却 ✓
curl -H "X-Debug-User: test-user" "http://127.0.0.1:8787/api/monthly?month_key=2026-02"

# Test 2: 認証ヘッダーなし → 401 ✓
curl "http://127.0.0.1:8787/api/monthly?month_key=2026-02"

# Test 3: month_key 不正 → 400 ✓
curl -H "X-Debug-User: test-user" "http://127.0.0.1:8787/api/monthly?month_key=bad"

# Test 4: 旧方式（クエリパラメータ user_id のみ）→ 401 ✓
curl "http://127.0.0.1:8787/api/monthly?user_id=test-user&month_key=2026-02"
```

### 残課題 / 次アクション
- トークン生成のユーティリティ（管理用スクリプト等）は未実装。本番運用開始時に作成予定。
- user_id の正規形式を定義・検証する（次の補完タスクで対応）。
- 次ステップ: POST /api/monthly（差分保存 + 楽観ロック）の実装。
- クライアント側キャッシュ（LRU 6ヶ月、TTL）は Phase 2 以降。

---

## 2026-02-12T15:00+09:00 — Phase 1 / Step 2-Auth 補完: user_id 正規形式の定義と検証

### 目的
user_id の正規（canonical）形式を決定・文書化し、認証ヘルパーで強制する。

### 変更ファイル
- `src/auth.ts` — user_id フォーマットバリデーション追加（`isValidUserId()`, `USER_ID_RE`）
- `docs/SPEC.md` — §9.1.1 追加（user_id 正規形式の定義）
- `docs/AGENT_LOG.md` — 追記（本エントリ）

### 主要な設計判断

1. **user_id 正規形式: `u_` + 32文字小文字hex（34文字固定）**
   - 正規表現: `/^u_[0-9a-f]{32}$/`
   - 導出: 認証識別子（メールアドレス等）→ SHA-256 → 先頭16バイトを hex → `u_` プレフィックス付与
   - 例: `user@example.com` → SHA-256 → `u_a1b2c3d4e5f60718293a4b5c6d7e8f90`

2. **選択理由**
   - 決定論的: 同一入力 → 同一 user_id（セッション/端末をまたいで安定）
   - プライバシー安全: 生メールアドレスを含まない（SHA-256は一方向）
   - ログ/URL安全: 英数字とアンダースコアのみ
   - 推測困難: ハッシュベースで他ユーザーの user_id を推測できない

3. **検証ポイント**
   - `src/auth.ts` の `getAuthUserId()` 内 — dev/prod 両モードで返却前にバリデーション
   - dev モード: `X-Debug-User` ヘッダー値をバリデーション（不正なら 400）
   - prod モード: トークン内 `sub` クレームをバリデーション（不正なら 400）

### 動作確認

```bash
npx tsc --noEmit  # 型エラーなし ✓
npx wrangler dev

# 正規形式の user_id → 200 ✓
curl -H "X-Debug-User: u_a1b2c3d4e5f60718293a4b5c6d7e8f90" \
  "http://127.0.0.1:8787/api/monthly?month_key=2026-02"

# 旧形式（plain text）→ 400 Bad Request ✓
curl -H "X-Debug-User: test-user" \
  "http://127.0.0.1:8787/api/monthly?month_key=2026-02"

# 認証なし → 401 Unauthorized ✓
curl "http://127.0.0.1:8787/api/monthly?month_key=2026-02"

# 大文字hex → 400 Bad Request ✓
curl -H "X-Debug-User: u_A1B2C3D4E5F60718293A4B5C6D7E8F90" \
  "http://127.0.0.1:8787/api/monthly?month_key=2026-02"
```

### 本番モードでの導出例（概念）
```
入力: メールアドレス "user@example.com"
  ↓ SHA-256
  hex: "a1b2c3d4e5f60718293a4b5c6d7e8f90..."（64文字）
  ↓ 先頭32文字を取得
  "a1b2c3d4e5f60718293a4b5c6d7e8f90"
  ↓ プレフィックス付与
  user_id: "u_a1b2c3d4e5f60718293a4b5c6d7e8f90"
```
※トークン生成時に sub クレームにこの正規形式を設定する。

### 残課題 / 次アクション
- トークン生成ユーティリティで正規 user_id 導出を組み込む（本番運用準備時）
- 次ステップ: POST /api/monthly（差分保存 + 楽観ロック）の実装
