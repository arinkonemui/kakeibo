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

---

## 2026-02-12T23:40+09:00 — Phase 1 / Step 3-Save: POST /api/monthly 実装

### 目的
差分ベースの保存エンドポイントを実装。楽観ロック（months.version）と編集可能月範囲チェックを含む。

### 変更ファイル
- `src/save.ts` — 新規作成（POST /api/monthly ハンドラ、バリデーション、トランザクション処理）
- `src/index.ts` — 変更（POST /api/monthly ルーティング追加）
- `docs/AGENT_LOG.md` — 追記（本エントリ）

### エンドポイント仕様

- URL: `POST /api/monthly`
- Body: `{ month_key, expected_version, ops: { create_entries, update_entries, delete_entry_ids, upsert_daily_budgets, delete_daily_budget_dates } }`
- 成功: `{ ok: true, month_key, new_version, applied: { ... } }`
- エラー: 400（バリデーション）/ 401（認証）/ 403（編集不可月）/ 409（version競合）

### 主要な設計判断

1. **トランザクション: D1 batch**
   - `db.batch(stmts)` で全操作をアトミックに実行
   - ステートメント順序: months INSERT OR IGNORE → version UPDATE (楽観ロック) → entries CUD → daily_budgets CUD
   - version UPDATE の affected rows が 0 なら 409 Conflict を返却

2. **楽観ロック**
   - `UPDATE months SET version = version + 1 WHERE ... AND version = expected_version`
   - months 行が未作成の場合: `INSERT OR IGNORE` で version=0 の行を先に作成
   - expected_version=0 で初回保存が成立

3. **編集可能月範囲: month_key 単位で6か月**
   - `getEditableMonthKeys()` で当月 + 過去5か月の Set を生成
   - 日付差分ではなく `new Date(year, month - 1 - i, 1)` で月キーを算出
   - 範囲外は 403 `"This month is read-only."`

4. **カテゴリ検証: インメモリ一括チェック**
   - `SELECT category_id FROM categories WHERE user_id = ?` で1クエリ
   - 結果を Set に変換し、create/update の全 category_id を検証
   - FK制約に依存せずアプリ層で明示的に検証（エラーメッセージの制御のため）

5. **entry_id 生成: `crypto.randomUUID()`**
   - create_entries で entry_id 未指定の場合、サーバ側で UUID を生成

6. **No-op 最適化**
   - 全 ops が空の場合、DB クエリを一切発行せず即座に成功レスポンスを返却
   - SPEC §9.4「変更がない場合、保存操作はクエリ発行なし」に準拠

7. **daily_budgets upsert**
   - `INSERT ... ON CONFLICT(user_id, month_key, date) DO UPDATE SET ...` で実現

8. **delete のスコープ制限**
   - entries: `WHERE entry_id = ? AND user_id = ? AND month_key = ?`
   - daily_budgets: `WHERE user_id = ? AND month_key = ? AND date = ?`
   - 他ユーザー/他月のデータに影響しない

### 動作確認

```bash
npx tsc --noEmit  # 型エラーなし ✓
npx wrangler dev

# Test 1: 正常保存（create entry + daily budget）→ 200 ✓
# Test 2: GET で version=1、entries/daily_budgets 確認 ✓
# Test 3: 409 Conflict（expected_version=0 で version=1 の月に保存）✓
# Test 4: 403 Read-only（2020-01 は編集不可）✓
# Test 5: 400 Invalid month_key ✓
# Test 6: 400 date mismatch（2026-03-01 で month_key=2026-02）✓
# Test 7: 401 No auth ✓
# Test 8: No-op（空 ops）→ 200, version 変化なし ✓
# Test 9: 日本語 payment_method（QR）→ 200 ✓
```

### DBクエリ数（保存時）
- カテゴリ検証: 1クエリ（entry操作がある場合のみ）
- batch: N+2 ステートメント（months INSERT OR IGNORE + version UPDATE + N個の ops）
- 合計: 予測可能で最小限

### 残課題 / 次アクション
- フロントエンド統合（Phase 2: 月間表表示）
- Windows curl で日本語 payment_method を直接送信するとエンコーディング問題あり（ファイル経由で回避可能、実運用はJSクライアントから送信するため問題なし）
- 月予算の更新操作は現在未対応（Phase 4 で対応予定）

---

## 2026-02-14T23:00+09:00 — Phase 2 / Step 1-Frontend Read: 月間テーブル表示（フロントエンド）

### 目的
React + TypeScript フロントエンドを新規作成し、GET /api/monthly のデータを月間テーブルとして表示する。

### フォルダ構成
```
web/                        ← 新規ディレクトリ（フロントエンド）
├── package.json            ← osaihu-note-web（Vite + React 19）
├── tsconfig.json
├── vite.config.ts          ← proxy: /api → http://127.0.0.1:8787
├── index.html              ← SPA エントリ（ブランディング文言使用）
└── src/
    ├── main.tsx            ← React createRoot
    ├── vite-env.d.ts
    ├── index.css           ← 暖色系カラーパレット準拠
    ├── types.ts            ← API レスポンス型定義
    ├── api.ts              ← fetch wrapper + X-Debug-User dev ヘッダー
    ├── useMonthly.ts       ← データ取得 hook
    ├── App.tsx             ← 月選択 + テーブル統合
    ├── MonthlyTable.tsx    ← 月間表（日×カテゴリ、支出のみ）
    └── DevUserBar.tsx      ← ローカル専用 dev user_id 入力
```

### 変更ファイル
- `web/` 配下全ファイル — 新規作成
- `.gitignore` — `web/dist/` 追加

### 主要な設計判断

1. **テーブル表示: 支出のみ（SPEC §3.1 準拠）**
   - `entries` のうち `type === 'expense'` のみを集計
   - カテゴリ列は `is_active=1` かつ `kind='expense'|'both'` のみ表示
   - 収入は月間表から除外（集計タブで後日対応）

2. **セル値: 同一日×カテゴリの expense amount 合計**
   - 1セル = `SUM(amount) WHERE date=X AND category_id=Y AND type='expense'`
   - 0 の場合は空セル表示

3. **日合算列: 右端に固定表示（sticky-right CSS）**
   - SPEC §3.1「右端に日合算列を固定表示（横スクロールしても常に見える）」準拠
   - 日・曜日列も左に sticky 固定

4. **カテゴリ合算行: テーブル最下部 (tfoot)**
   - 各カテゴリの月内支出合計を表示

5. **Vite proxy: `/api` → `http://127.0.0.1:8787`**
   - 本番と同じ相対パスでAPI呼び出し（CORS不要）
   - RULES §2.4 準拠

6. **X-Debug-User ヘッダー（dev専用）**
   - `DevUserBar` コンポーネントでローカル開発時のみ表示
   - `window.location.hostname` が `localhost` or `127.0.0.1` の場合のみ
   - localStorage に保存、本番には一切影響しない
   - user_id は正規形式 `u_` + 32桁hex を想定

7. **空データ対応**
   - `month: null` の場合もテーブルは表示（全セル空）
   - 「この月のデータはまだありません。」メッセージ表示

8. **カラーパレット**
   - SPEC のカラー方針に基づき暖色系で統一
   - `--color-primary: #FF9F43`, `--color-accent: #FF6B6B`, `--color-warm: #F7C59F`
   - ペーパーカラー: `#FFFAF0`

### 動作確認手順

```bash
# ターミナル1: API サーバ起動
cd /path/to/006.家計簿
npx wrangler dev

# ターミナル2: フロントエンド起動
cd /path/to/006.家計簿/web
npm run dev
# → http://localhost:5173 で開く

# ブラウザで確認:
# 1. DevUserBar に u_a1b2c3d4e5f60718293a4b5c6d7e8f90 を入力→「設定」
# 2. 月選択で 2026-02 を選択
# 3. Network タブで GET /api/monthly?month_key=2026-02 が飛ぶことを確認
# 4. X-Debug-User ヘッダーが含まれていることを確認
# 5. テーブルが表示される（データなしの場合は空テーブル＋メッセージ）
```

### 検証結果
- `npx tsc -b` — 型エラーなし ✓
- `npx vite build` — ビルド成功（dist/ 生成）✓
- バンドルサイズ: JS 200KB (gzip 63KB), CSS 2.7KB (gzip 1KB)

### 残課題 / 次アクション
- LRU キャッシュ（6ヶ月、TTL）は未実装（Phase 2 の後続で対応）
- 保存機能（POST /api/monthly）のUI統合は Phase 3
- 日予算超過の赤表示は Phase 4（daily_budgets 表示のみ対応済み、超過判定は未実装）
- 週間ビュー、集計タブ、出力タブは Phase 5-6

---

## 2026-02-16T22:00+09:00 — Phase 2 / Step 2-Frontend Edit+Save: 明細追加・削除・保存 MVP

### 目的
月間テーブルのセルクリックで明細を追加・削除し、POST /api/monthly で保存するフローを実装する。

### 変更ファイル
- `web/src/types.ts` — SaveOps, CreateEntryOp, SaveResponse, SaveConflict, SaveResult 型追加
- `web/src/api.ts` — `saveMonthly()` POST関数追加（409を専用型で返却）
- `web/src/monthUtils.ts` — **新規**（編集可能月判定、サーバ側と同一ロジック）
- `web/src/useOpsQueue.ts` — **新規**（操作キュー hook: create/delete を蓄積）
- `web/src/EntryModal.tsx` — **新規**（セルクリック→明細追加/一覧/削除モーダル）
- `web/src/MonthlyTable.tsx` — セルクリックハンドラ追加、localEntries props 追加
- `web/src/App.tsx` — 保存ボタン、409/エラーUI、read-onlyバナー、未保存ガード統合
- `web/src/index.css` — モーダル、保存バー、バナー、クリッカブルセルのスタイル追加

### 主要な設計判断

1. **操作キュー方式（diff不要）**
   - ユーザーの追加/削除操作を `useOpsQueue` に蓄積
   - 保存時に `buildSaveOps()` で SaveOps を構築して POST
   - full diff 計算は不要。操作が即座に記録される

2. **ローカル状態の即時反映**
   - `localEntries` = サーバ entries + キュー内 creates − キュー内 deletes
   - MonthlyTable は `localEntries` から `buildCellMap` するため、追加/削除が即座にテーブル・合計に反映

3. **保存フロー**
   - 成功(200): キューリセット + refetch で最新データ表示
   - 409 Conflict: 赤バナー + 「最新データを取得」ボタン
   - 400/401/403: エラーメッセージ表示

4. **編集可能月ガード（フロントエンド側）**
   - `isEditableMonth(monthKey)` で当月+過去5ヶ月を判定（month_key単位）
   - 範囲外: 黄色バナー表示、セルクリック無効、保存バー非表示
   - サーバ側でも二重チェック（403）

5. **月切替時の未保存ガード**
   - `isDirty` 状態で月変更 → `confirm()` で確認

6. **MVP制限**
   - 既存明細の編集(update)は未実装（追加と削除のみ）
   - daily_budgets / 月予算の操作は未実装
   - LRU キャッシュは未実装

### 動作確認手順

```bash
# ターミナル1: API サーバ起動
cd /path/to/006.家計簿
npx wrangler dev

# ターミナル2: フロントエンド起動
cd /path/to/006.家計簿/web
npm run dev
# → http://localhost:5173

# ブラウザで確認:
# 1. DevUserBar に u_a1b2c3d4e5f60718293a4b5c6d7e8f90 を入力→「設定」
# 2. 2026-02 を選択（編集可能月）
# 3. テーブルセル（例: 1日×食費）をクリック → モーダル表示
# 4. 金額 500 入力 → 「追加」→ テーブルに即反映、保存バー出現
# 5. 「保存」クリック → Network タブで POST /api/monthly 確認 → 200
# 6. ページリロード → 追加した明細が永続化されている
# 7. 古い月（例: 2020-01）を開く → 黄色バナー表示、セルクリック不可
```

### 検証結果
- `npx tsc -b` — 型エラーなし ✓
- `npx vite build` — ビルド成功 ✓
- バンドルサイズ: JS 206KB (gzip 65KB), CSS 5.5KB (gzip 1.5KB)

### 残課題 / 次アクション
- 既存明細の編集(update) UI は Phase 3 後続で対応
- LRU キャッシュ（6ヶ月、TTL）は未実装
- daily_budgets / 月予算の編集は Phase 4
- 集計タブ、出力タブは Phase 5-6

## 2026-03-19 UI改善4点 + カテゴリ管理機能追加

### Goal
1. 「日合算」→「一日合計」ラベル変更
2. テーブルセル金額に「¥」プレフィックス追加
3. 明細一覧の削除ボタンを右端に統一
4. カテゴリ 追加・編集・削除機能をバックエンド＋フロントエンドで実装

### Files Changed
- web/src/MonthlyTable.tsx: ①② ヘッダー「一日合計」、金額4箇所に「¥」追加
- web/src/EntryModal.tsx: ③ スペーサー挿入
- web/src/index.css: ③ .entry-spacer追加、.entry-memoからflex:1削除、④ CategoryManager スタイル追加、.month-selector-sub追加
- web/src/api.ts: ④ createCategory/updateCategory/deleteCategory 追加、CategoryRow import追加
- web/src/CategoryManager.tsx: ④ 新規 UI コンポーネント
- web/src/App.tsx: ④ CategoryManager 統合、catManagerOpen state追加、ボタン追加
- src/categories.ts: ④ 新規バックエンドハンドラー
- src/index.ts: ④ /api/categories ルート追加

### Key Decisions
- カテゴリ削除はソフトデリート（is_active=0）: entries テーブルの FK 整合性を保ちつつ歴史データを保存
- CategoryManager はローカル state で楽観的 UI 更新し、API 失敗時はエラー表示
- カテゴリ変更後は refetch() で月次データセットを再取得（categories が MonthlyDataset に含まれる）
- 削除ボタン右端統一: .entry-memo の flex:1 を除去し、.entry-spacer { flex: 1 } を memo とボタンの間に挿入

### Verification
- MonthlyTable: 「一日合計」ヘッダー表示確認
- MonthlyTable: 金額セルに「¥」表示確認（0円セルは空のまま）
- EntryModal: メモ有無にかかわらず削除ボタンが右端に揃うことを確認
- カテゴリ管理: 追加→テーブル列反映、編集→列名更新、削除→列消去を確認

### Next Actions
- Phase 4（予算設定）、Phase 5（集計タブ）、Phase 6（CSV/PDF出力）の実装

---

## 2026-03-19 明細編集（UPDATE）機能追加

### Goal
Phase 3 の残タスク：既存明細の編集（UPDATE）をフロントエンドに実装。バックエンドは save.ts に update_entries が既に実装済みだったため、フロントのみ追加。

### Files Changed
- web/src/types.ts: UpdateEntryOp インターフェース追加、SaveOps に update_entries 追加
- web/src/useOpsQueue.ts: updates キュー追加、updateEntry メソッド追加（ローカル create の直接編集 or サーバーエントリの updates キュー追加）、isDirty/pendingCount/buildSaveOps を更新
- web/src/EntryModal.tsx: 明細行に「編集」ボタン追加、クリックでインライン編集フォーム表示（金額/メモ/支払方法/種別を編集可能）、onUpdate コールバック追加
- web/src/App.tsx: handleUpdateEntry コールバック追加、localEntries マージに updates を反映（updateMap）、EntryModal に onUpdate を受け渡し
- web/src/index.css: .entry-edit-form / .entry-edit-row / .entry-edit-actions スタイル追加

### Key Decisions
- 日付とカテゴリはセル座標なので編集不可（移動は削除＋新規追加で対応）
- ローカル create のエントリを編集した場合は creates 配列内を直接変更（不要な update op を送らない）
- サーバーエントリの編集は updates キューに追加し、同じ entry_id の重複は最新で上書き
- 削除時に updates キューからも除去（不要な update を送らない）

### Verification
- 明細一覧の「編集」ボタンでインライン編集フォームが表示されること
- 金額・メモ・支払方法・種別を編集して「保存」→テーブルに即反映
- 「キャンセル」で元の表示に戻ること
- ローカル create の編集→ creates が変更され、update op は発生しない
- 保存後のサーバー反映を確認（POST /api/monthly の update_entries）

### Next Actions
- Phase 2 残タスク（タブUI + 週間ビュー）

---

## 2026-03-19 Phase 2 残タスク：タブUI + 週間ビュー

### Goal
SPEC §2 で定義された5タブ構成を導入し、週間ビューを実装。

### Files Changed
- web/src/App.tsx: activeTab state 追加、タブバー UI（月間/週間/集計/設定/出力）、表示切替ロジック
- web/src/WeeklyTable.tsx: 新規。月曜開始で月内日を週分割し、週ごとにミニテーブル表示
- web/src/index.css: .tab-bar / .tab-item / .tab-item--active / .tab-placeholder / .weekly-view / .week-section / .week-label スタイル追加

### Key Decisions
- タブ切替で追加 DB フェッチなし（RULES §2.1 遵守）。同じ MonthlyDataset を共有
- 週の開始曜日は月曜日（SPEC §5）。月初が月曜でなければ最初の週は短い
- WeeklyTable は MonthlyTable と同じ Props 構造（data, monthKey, localEntries, editable, onCellClick）
- 集計/設定/出力タブは「準備中」プレースホルダー（各 Phase で実装予定）
- 週間ビューのセルクリック → 既存 EntryModal を共有（同じ onCellClick コールバック）

### Verification
- タブバーが表示され「月間」がデフォルト選択
- 月間→週間切替で追加フェッチなし
- 週間ビューで月曜開始の各週テーブル＋週計行が表示
- 週間ビューでセルクリック→EntryModal が開く
- 集計/設定/出力タブ→「準備中」表示
- tsc --noEmit エラーなし

### Next Actions
- Phase 4（予算設定）、Phase 5（集計タブ）、Phase 6（CSV/PDF出力）の実装

---

## 2026-03-19T00:00+09:00 — Phase 4: 予算・日予算上書き

### 目的
月予算設定 UI（設定タブ）+ 日別予算上書き + 日予算超過赤表示 + 合計超過警告 を実装する。

### 変更ファイル
- `src/settings.ts` — 新規作成（POST /api/settings：monthly_budget 更新）
- `src/index.ts` — POST /api/settings ルートを追加
- `web/src/types.ts` — UpsertDailyBudgetOp 追加、SaveOps に upsert_daily_budgets / delete_daily_budget_dates 追加
- `web/src/useOpsQueue.ts` — dailyBudgetUpserts / deleteDailyBudgetDates をキューに追加、setDailyBudget / deleteDailyBudget メソッド追加
- `web/src/api.ts` — saveBudget(monthKey, monthlyBudget) 追加
- `web/src/MonthlyTable.tsx` — localDailyBudgets prop 追加、日予算超過時に .cell-over-budget クラス付与
- `web/src/WeeklyTable.tsx` — 同上（週間ビューも赤表示対応）
- `web/src/SettingsTab.tsx` — 新規作成（月予算設定＋日別予算上書きUI）
- `web/src/App.tsx` — localDailyBudgets 計算追加、SettingsTab 統合、MonthlyTable/WeeklyTable に localDailyBudgets 渡す
- `web/src/index.css` — .cell-over-budget / .settings-tab / .settings-section / .budget-warning 等スタイル追加

### Key Decisions
1. **月予算は別エンドポイント（POST /api/settings）で保存**
   - entries の差分保存（optimistic lock あり）とは独立した設定変更
   - INSERT OR IGNORE + UPDATE のバッチで months 行を upsert
2. **日別予算上書きは既存の POST /api/monthly の ops に含める**
   - save.ts は upsert_daily_budgets / delete_daily_budget_dates を既にサポート済み
   - useOpsQueue の isDirty / pendingCount / buildSaveOps に統合し、メインの「保存」ボタンで一括保存
3. **localDailyBudgets は useMemo で計算（server + local ops の合算）**
   - App.tsx で計算し MonthlyTable / WeeklyTable / SettingsTab に渡す（タブ切替でも再フェッチなし）
4. **デフォルト日予算 = Math.floor(monthly_budget / daysInMonth)**
   - 日別上書きがある日はそちらを優先
5. **日予算超過 → .cell-over-budget クラス → strong { color: #e74c3c }**
   - 月間・週間両方で表示

### Verification
- 設定タブで月予算を入力→「月予算を保存」→ refetch 後に月間表ヘッダに月予算・月残が反映
- デフォルト日予算が設定ヒントに表示される
- 日別上書きを追加→「保存」ボタンで保存→その日の一日合計が超えると赤表示
- 日別上書きの合計が月予算を超えると警告文表示
- tsc --noEmit エラーなし（型チェック通過）

### Next Actions
- Phase 5（集計タブ：カテゴリ円グラフ・日別折れ線グラフ）
- Phase 6（出力タブ：CSV/PDF エクスポート）

---

## 2026-03-19T02:00+09:00 — Phase 5: 集計タブ

### 目的
カテゴリ別円グラフ・日別折れ線グラフ・月の合算値サマリーを集計タブに実装する（SPEC §7, PLAN Phase 5）。

### 変更ファイル
- `web/src/aggregateUtils.ts` — 新規。集計計算関数（computeCategoryTotals, computeDailyTotals, computeMonthlySummary）
- `web/src/charts/PieChart.tsx` — 新規。Pure SVG 円グラフコンポーネント
- `web/src/charts/LineChart.tsx` — 新規。Pure SVG 折れ線グラフコンポーネント
- `web/src/AggregateTab.tsx` — 新規。集計タブ本体（useMemo で計算、3セクション配置）
- `web/src/App.tsx` — AggregateTab import、プレースホルダー差し替え
- `web/src/index.css` — .agg-* スタイル追加（サマリーグリッド、カテゴリ行、レスポンシブ）

### Key Decisions
1. **外部チャートライブラリ不使用（Pure SVG）**
   - 依存追加なし。React/ReactDOM のみの方針を維持
   - 円グラフ: SVG path でアーク描画、凡例は HTML
   - 折れ線: SVG viewBox ベース、polyline + area fill + budget 破線
   - Phase 6（PDF）で SVG をそのまま埋め込み可能
2. **折れ線グラフは日別支出合計**（累計ではない。SPEC §7「日別折れ線」の自然な読み）
3. **カラーパレットは暖色系12色**（SPEC §0 ブランド方針に準拠）
4. **集計はすべて useMemo で localEntries から計算**（追加 DB フェッチなし、RULES §2.1 遵守）
5. **640px 以下で円グラフ＋テーブルを縦積み**（レスポンシブ対応）

### Verification
- tsc --noEmit エラーなし
- 支出データありの月 → 円グラフ・折れ線・サマリーが表示
- 月間表のカテゴリ合計と集計タブのカテゴリ金額が一致すること
- 月間↔集計タブ切替 → Network に追加リクエストなし
- 月予算設定時 → 折れ線グラフに日予算の破線ライン表示

### Next Actions
- Phase 6（出力タブ：CSV/PDF エクスポート）

---

## 2026-03-26T00:00+09:00 — ログイン機能実装（メール＋パスワード認証）

### 目的
複数ユーザーが独立して利用できる本番向け認証基盤を追加。
メール＋パスワード＋任意ユーザー名での登録・ログイン、JWT（Bearer トークン）で API 認証。
将来の OAuth（Google/LINE/Yahoo/X/Instagram/Facebook）を PLAN.md に明記。

### 変更ファイル
- `db/schema.sql` — users テーブルに email / password_hash / username 追加
- `docs/DB_SCHEMA.md` — 新列のドキュメント
- `docs/PLAN.md` — §3.5 認証セクション追加（メール実装済み、OAuth 追加予定を明記）
- `src/auth.ts` — issueToken(), deriveUserId(), hashPassword(), verifyPassword() 追加
- `src/authApi.ts` — 新規。POST /api/auth/register・login ハンドラ
- `src/index.ts` — auth ルートを getAuthUserId の前に追加（公開エンドポイント）
- `web/src/useAuth.ts` — 新規。token/userId/displayName を localStorage 管理する hook
- `web/src/LoginScreen.tsx` — 新規。ログイン・新規登録タブ切り替え UI
- `web/src/api.ts` — buildHeaders() に Bearer トークン追加（非 dev 環境）、authRegister/authLogin 追加
- `web/src/App.tsx` — 非 dev 環境で未認証時に LoginScreen 表示、ヘッダーにユーザー名＋ログアウトボタン
- `web/src/index.css` — ログイン画面スタイル (.login-*) + ユーザーバー (.app-user-bar)

### Key Decisions
1. **localhost では LoginScreen をスキップ**（既存の DevUserBar フローを維持。DEV_MODE フラグ依存ではなく hostname で判定）
2. **パスワードハッシュは PBKDF2（Web Crypto API）**。Cloudflare Workers では bcrypt 未対応のため
3. **user_id はメールから決定論的に生成**（SHA256(email)[0:16].hex()）。DB lookup は email で行い FK は user_id
4. **ダミーハッシュで timing-safe 比較**（email 不存在でも同じ時間をかけることで列挙を防止）
5. **Bearer トークン有効期限 30 日**
6. **App コンポーネントを App + AppInner に分割**（hooks の条件分岐を避けるため）

### Verification
- tsc --noEmit エラーなし
- 本番環境: 未ログイン → LoginScreen 表示
- 新規登録 → 201 + token
- ログイン → 200 + token
- 重複登録 → 409
- 誤パスワード → 401
- ログアウト → LoginScreen に戻る
- localhost 環境: DevUserBar が引き続き動作（LoginScreen は表示されない）

### Next Actions
- Phase 6（出力タブ：CSV/PDF エクスポート）
- RULES §2.2 キャッシュ（LRU 6ヶ月・TTL）
