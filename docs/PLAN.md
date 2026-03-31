# 開発計画（PLAN）

## 0. 目的
- MVPを「月間表（縦:日付 / 横:カテゴリ）」中心に成立させる
- DBアクセス最小化・キャッシュ・競合チェックを初期から組み込む
- 出力（CSV/PDF）とアーカイブ閲覧まで含めて一通りの運用を成立させる

## 1. 事前成果物（必須）
- docs/SPEC.md（ブランディング/SEO含む）
- docs/RULES.md
- docs/PLAN.md
- docs/DB_SCHEMA.md（db/schema.sql と同期）
- db/schema.sql（D1スキーマのソースオブトゥルース）
- docs/AGENT_LOG.md（追記式）

## 2. フェーズ分割（MVP優先）

### Phase 1: 基盤（データモデル + 認証/ユーザー識別）
- DBテーブル作成（users, months, categories, entries, daily_budgets）
- docs/DB_SCHEMA.md を確定し db/schema.sql と同期
- user_id の確定（認証方式は最小構成でよいが、DB上はuser_id統一）
- months.version を用いた競合チェックの枠組みを用意（保存時必須）
- docs/AGENT_LOG.md を作成（追記式で運用開始）

### Phase 2: 月間（メイン）表示
- フロントは React + TypeScript（Vite）で実装する
- ローカル開発（A案）：Vite dev server の proxy で `/api/*` → `http://127.0.0.1:8787` に転送し、CORS無しで開発する
- 1ヶ月データセット取得（months + entries + daily_budgets + categories）
- 月間表（縦:日付 / 横:カテゴリ）表示
  - 右端：日合算列固定
  - 下部：カテゴリ合算行
- 支出のみ表示（収入は月間表から除外）

### Phase 3: 明細入力（差分更新）と保存
- 1明細入力：日付/金額/カテゴリ/メモ/支払方法（任意）
- 収入入力も可能（ただし月間表は支出のみ）
- 保存は差分更新のみ（一覧再取得禁止）
- 保存ボタン：
  - 変更なしならクエリ発行なし（ノーオペ）
  - 競合（version不一致）なら保存拒否→最新取得→再編集

### Phase 4: 予算・日予算上書き
- 月予算設定
- デフォルト日予算（切り捨て）と日別上書き（daily_budgets）
- 日予算合計 > 月予算 の注意表示
- 日予算超過（赤表示）

### Phase 5: 集計タブ
- カテゴリ円グラフ（支出）
- 日別折れ線（支出）
- 月の合算値表示

### Phase 6: 出力タブ
- CSV出力：ひと月分の明細CSVのみ
- PDF出力：A4固定2枚（1枚目:明細、2枚目:グラフ＋合算値）
- アーカイブ運用：
  - 2年以上前データ整理の促し（削除はユーザー操作のみ）
  - アーカイブCSV読み込み表示（読み取り専用、保存不可）
  - 表示文言：アーカイブ表示のため保存できません
  - 復元ボタンなし

## 3. 非機能（必須チェックリスト）
- [ ] 月表示は月単位の取得のみ。タブ切替等で追加取得しない
- [ ] 月キャッシュ：6ヶ月LRU
- [ ] TTL：当月120分 / 過去月24時間
- [ ] 起動時：当月を必ず1回取得
- [ ] 保存：差分更新のみ、変更なしはノーオペ
- [ ] 競合：months.version不一致は保存拒否＋最新取得を促す
- [ ] アーカイブCSV表示：読み取り専用、保存不可、文言統一

## 3.5 認証（ログイン機能）

### 実装済み：メール＋パスワード認証
- 登録 / ログイン画面（ログイン・新規登録をタブ切り替え）
- ユーザー名は任意登録。未入力時はメールの `@` より前を表示
- パスワードハッシュ：PBKDF2（SHA-256, 100,000 iterations）
- トークン：HMAC-SHA256 署名付き Bearer トークン（有効期限30日）

### 将来追加予定：ソーシャル / OAuth ログイン

以下のプロバイダを後続フェーズで追加する予定。
users テーブルに `auth_provider TEXT DEFAULT 'email'` 列を追加して対応する。

| プロバイダ | エンドポイント | 備考 |
|---|---|---|
| Google | POST /api/auth/google | 最も実装例が多い |
| LINE | POST /api/auth/line | 日本ユーザーに強い |
| Yahoo! JAPAN | POST /api/auth/yahoo | 個人開発者登録に審査あり |
| X (Twitter) | POST /api/auth/twitter | OAuth 2.0 PKCE フロー |
| Instagram | POST /api/auth/instagram | Meta Business Platform 経由 |
| Facebook | POST /api/auth/facebook | Meta Business Platform 経由（Instagram と同基盤） |

> **注意:** Instagram / Facebook は同じ Meta Developer Platform を使用する。
> X は OAuth 2.0 PKCE フローで実装（旧 OAuth 1.0a は非推奨）。
> いずれも user_id 生成ルール（SHA256(email) → u_ + 32hex）は統一して維持する。

## 4. AGENT_LOG 運用（必須）
- 開発開始時に `docs/AGENT_LOG.md` を作成する
- 以後、作業単位で追記する（既存行の編集・削除は禁止）
- 追記テンプレートは RULES.md の要件に従う