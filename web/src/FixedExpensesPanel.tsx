/**
 * FixedExpensesPanel — 月間・週間タブの左サイドバー（編集可能）
 * useFixedExpenses hook からデータを受け取り、金額を直接編集できる。
 * カテゴリ管理（追加/削除/名前変更）は「カテゴリ管理」ボタン → FixedExpensesManager モーダル。
 */
import type { UseFixedExpensesReturn } from "./useFixedExpenses";

const ICON_MAP: Record<string, string> = {
  home:      "🏠",
  flame:     "🔥",
  faucet:    "🚰",
  bulb:      "💡",
  phone:     "📶",
  train:     "🚇",
  monitor:   "🖥️",
  clothes:   "👕",
  cosmetics: "💄",
  furniture: "🛏️",
  car:       "🚗",
  food:      "🍽️",
  cafe:      "☕",
  video:     "🎬",
  book:      "📚",
  music:     "🎵",
  education: "🎓",
  game:      "🎮",
  custom:    "📌",
};

function fmt(n: number): string {
  return n.toLocaleString("ja-JP");
}

function fmtCompact(n: number | string): string {
  const num = typeof n === "string" ? (n === "" ? 0 : parseInt(n, 10)) : n;
  if (isNaN(num)) return "";
  return num.toLocaleString("ja-JP");
}

interface Props {
  fx: UseFixedExpensesReturn;
  /** 「固定費カテゴリ管理」ボタン押下時のコールバック */
  onManage: () => void;
}

export function FixedExpensesPanel({ fx, onManage }: Props) {
  const { items, loading, error, draftAmounts, setDraftAmounts, saving, savedMsg, handleSaveAll } = fx;

  const total = items.reduce((sum, item) => {
    const draft = draftAmounts[item.fixed_expense_id] ?? "";
    const v = draft === "" ? 0 : parseInt(draft, 10);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);

  return (
    <div className="fixed-panel">
      <div className="fixed-panel-header">
        <span className="fixed-panel-title">固定費</span>
        <button className="btn-open-cat" onClick={onManage}>
          カテゴリ管理
        </button>
      </div>

      {loading && <p className="fixed-panel-loading">読み込み中…</p>}
      {error && <p className="budget-error" style={{ fontSize: "0.8rem", padding: "4px" }}>{error}</p>}

      {!loading && (
        <>
          <ul className="fixed-panel-list">
            {items.length === 0 && (
              <li className="fixed-panel-empty">固定費がありません</li>
            )}
            {items.map((item) => (
              <li key={item.fixed_expense_id} className="fixed-panel-item">
                <span className="fixed-panel-icon">
                  {ICON_MAP[item.icon_key] ?? "📌"}
                </span>
                <span className="fixed-panel-name" title={item.name}>
                  {item.name}
                </span>
                <div className="fixed-panel-amount-wrapper">
                  <span className="fixed-panel-yen">¥</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    min="0"
                    className="fixed-panel-amount-input"
                    value={fmtCompact(draftAmounts[item.fixed_expense_id] ?? "")}
                    onChange={(e) => {
                      const v = e.target.value.replace(/,/g, "");
                      setDraftAmounts((prev) => ({
                        ...prev,
                        [item.fixed_expense_id]: v,
                      }));
                    }}
                    placeholder="0"
                  />
                </div>
              </li>
            ))}
          </ul>

          <div className="fixed-panel-total">
            固定費合計: <strong>¥{fmt(total)}</strong>
          </div>

          <div className="fixed-panel-actions">
            <button
              className="btn-add fixed-panel-save-btn"
              onClick={() => void handleSaveAll()}
              disabled={saving}
            >
              {saving ? "保存中…" : "保存"}
            </button>
            {savedMsg && <span className="fixed-panel-saved">保存しました</span>}
          </div>
        </>
      )}
    </div>
  );
}
