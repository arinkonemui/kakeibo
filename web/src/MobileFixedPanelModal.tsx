import { useState } from "react";
import { useModalClose } from "./useModalClose";
import type { UseFixedExpensesReturn } from "./useFixedExpenses";

const ICON_MAP: Record<string, string> = {
  home:       "🏠",
  flame:      "🔥",
  faucet:     "🚰",
  bulb:       "💡",
  phone:      "📶",
  smartphone: "📱",
  train:      "🚇",
  monitor:    "🖥️",
  clothes:    "👕",
  cosmetics:  "💄",
  furniture:  "🛏️",
  car:        "🚗",
  building:   "🏢",
  food:       "🍽️",
  cafe:       "☕",
  video:      "🎬",
  book:       "📚",
  music:      "🎵",
  education:  "🎓",
  game:       "🎮",
  custom:     "📌",
};

function fmtCompact(n: number | string): string {
  const num = typeof n === "string" ? (n === "" ? 0 : parseInt(n, 10)) : n;
  if (isNaN(num)) return "";
  return num.toLocaleString("ja-JP");
}

function fmt(n: number): string {
  return n.toLocaleString("ja-JP");
}

interface Props {
  type: "expense" | "income";
  fx: UseFixedExpensesReturn;
  onClose: () => void;
  onManage: () => void;
}

export function MobileFixedPanelModal({ type, fx, onClose, onManage }: Props) {
  const { closing, handleClose } = useModalClose(onClose);
  const [saving, setSaving] = useState(false);

  const items = type === "expense" ? fx.expenseItems : fx.incomeItems;
  const title = type === "expense" ? "固定費一覧" : "収入一覧";
  const totalLabel = type === "expense" ? "固定費合計" : "収入合計";

  const total = items.reduce((sum, item) => {
    const draft = fx.draftAmounts[item.fixed_expense_id] ?? "";
    const v = draft === "" ? 0 : parseInt(draft, 10);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);

  async function handleSave() {
    setSaving(true);
    await fx.handleSaveAll();
    setSaving(false);
    onClose();
  }

  function handleCancel() {
    fx.resetDrafts();
    handleClose();
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className={`modal-content${closing ? " closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-open-cat" onClick={onManage}>カテゴリ設定</button>
          <button className="modal-close" onClick={handleClose}>✕</button>
        </div>

        <ul className="fixed-panel-list">
          {items.length === 0 && (
            <li className="fixed-panel-empty">データがありません</li>
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
                  value={fmtCompact(fx.draftAmounts[item.fixed_expense_id] ?? "")}
                  onChange={(e) => {
                    const v = e.target.value.replace(/,/g, "");
                    fx.setDraftAmounts((prev) => ({
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
          {totalLabel}: <strong>¥{fmt(total)}</strong>
        </div>

        <div className="mobile-fixed-modal-actions">
          <button className="btn-add" onClick={handleSave} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
          <button className="btn-cancel" onClick={handleCancel}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
