# CLAUDE.md — おさいふノート

## 参照ファイル（必要時のみ読む）
| 作業 | ファイル |
|---|---|
| 新機能・ロードマップ | docs/PLAN.md |
| DBスキーマ | docs/DB_SCHEMA.md + db/schema.sql |
| API・保存・キャッシュ | docs/RULES.md |
| UIコピー・ブランド | docs/SPEC.md §8 |
| ログ追記前 | docs/AGENT_LOG.md | 現在は読み込み不要とする。

## 仕様の源泉
- 要件: docs/SPEC.md　制約: docs/RULES.md　ロードマップ: docs/PLAN.md
- DBスキーマ: db/schema.sql（正）+ docs/DB_SCHEMA.md

## 非機能制約（厳守）
- **DBアクセス**: 月次ビューは月1回のみフェッチ。タブ切替・スクロール・セル選択で追加フェッチ禁止。CSV/PDFエクスポートも再フェッチ禁止。
- **キャッシュ**: LRU 6か月。TTL: 当月120分・過去月24時間。アプリ起動時に当月1回リフレッシュ。6か月はmonth_key単位。
- **保存**: diff-based（create/update/delete）。変更なし→ノーオペレーション。
- **編集可能範囲**: 当月+過去5か月。それ以降は読み取り専用。サーバー・クライアント両方で強制。month_key単位で判定。
- **楽観的ロック**: `months.version` を使用。`expected_version` が一致する場合のみ保存成功。不一致時は再フェッチを促す。

## UIコピー
- アーカイブCSV閲覧中: 「アーカイブ表示のため保存できません」
- ブランドコピーはdocs/SPEC.mdに従う（タイトル・メタ・キャッチフレーズ・カラー）

## リポジトリ設定
- `wrangler.toml` はコミット禁止（.gitignore済）。`wrangler.toml.example` を参照。
- 環境固有ID・シークレットをコミットしない。

## ログ（必須）
docs/AGENT_LOG.md に追記のみ（削除・上書き禁止）:
タイムスタンプ / 目的 / 変更ファイル / 決定理由 / 検証方法 / 次のアクション

## DBスキーマ変更
db/schema.sql と docs/DB_SCHEMA.md を同時更新。docs/AGENT_LOG.md に理由を記録。

## 出力スタイル
最小限のdiff。変更内容と検証方法を明示。

## 開発サーバー起動順（必須）
Wrangler先（localhost:8787）→ Vite後（localhost:5173）。逆順だとECONNREFUSED。
