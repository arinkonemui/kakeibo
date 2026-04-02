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
  onManageExpense: () => void;
  onManageIncome: () => void;
}

function ItemList({
  items,
  draftAmounts,
  setDraftAmounts,
  emptyLabel,
}: {
  items: import("./types").FixedExpenseRow[];
  draftAmounts: Record<string, string>;
  setDraftAmounts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  emptyLabel: string;
}) {
  return (
    <ul className="fixed-panel-list">
      {items.length === 0 && (
        <li className="fixed-panel-empty">{emptyLabel}</li>
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
  );
}

function calcTotal(items: import("./types").FixedExpenseRow[], draftAmounts: Record<string, string>): number {
  return items.reduce((sum, item) => {
    const draft = draftAmounts[item.fixed_expense_id] ?? "";
    const v = draft === "" ? 0 : parseInt(draft, 10);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);
}

export function FixedExpensesPanel({ fx, onManageExpense, onManageIncome }: Props) {
  const { expenseItems, incomeItems, loading, error, draftAmounts, setDraftAmounts, saving, savedMsg, handleSaveAll } = fx;

  const expenseTotal = calcTotal(expenseItems, draftAmounts);
  const incomeTotal = calcTotal(incomeItems, draftAmounts);

  return (
    <div className="fixed-panel-container">
      {loading && <p className="fixed-panel-loading">読み込み中…</p>}
      {error && <p className="budget-error" style={{ fontSize: "0.8rem", padding: "4px" }}>{error}</p>}

      <div className="fixed-panel">
        <div className="fixed-panel-header">
          <span className="fixed-panel-title">固定費</span>
          <button className="btn-open-cat" onClick={onManageExpense}>
            カテゴリ管理
          </button>
        </div>
        {!loading && (
          <>
            <ItemList
              items={expenseItems}
              draftAmounts={draftAmounts}
              setDraftAmounts={setDraftAmounts}
              emptyLabel="固定費がありません"
            />
            <div className="fixed-panel-total">
              固定費合計: <strong>¥{fmt(expenseTotal)}</strong>
            </div>
          </>
        )}
      </div>

      <div className="fixed-panel">
        <div className="fixed-panel-header">
          <span className="fixed-panel-title">収入</span>
          <button className="btn-open-cat" onClick={onManageIncome}>
            カテゴリ管理
          </button>
        </div>
        {!loading && (
          <>
            <ItemList
              items={incomeItems}
              draftAmounts={draftAmounts}
              setDraftAmounts={setDraftAmounts}
              emptyLabel="収入がありません"
            />
            <div className="fixed-panel-total">
              収入合計: <strong>¥{fmt(incomeTotal)}</strong>
            </div>
          </>
        )}
      </div>

      {!loading && (
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
      )}
    </div>
  );
}
