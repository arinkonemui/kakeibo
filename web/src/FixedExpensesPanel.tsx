/**
 * FixedExpensesPanel — 月間・週間タブの左サイドバー（表示専用）
 * 編集は「固定費管理」ボタン → 予算タブ（SettingsTab の FixedExpensesSection）で行う。
 */
import { useEffect, useState } from "react";
import { fetchFixedExpenses } from "./api";
import type { FixedExpenseRow } from "./types";

const ICON_MAP: Record<string, string> = {
  home:   "🏠",
  flame:  "🔥",
  faucet: "🚰",
  bulb:   "💡",
  phone:  "📶",
  custom: "📌",
};

function fmt(n: number): string {
  return n.toLocaleString("ja-JP");
}

interface Props {
  /** 「固定費管理」ボタン押下時のコールバック（予算タブへ切替など） */
  onManage: () => void;
}

export function FixedExpensesPanel({ onManage }: Props) {
  const [items, setItems] = useState<FixedExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchFixedExpenses()
      .then((data) => {
        if (!cancelled) {
          setItems(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const total = items.reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="fixed-panel">
      <div className="fixed-panel-header">
        <span className="fixed-panel-title">固定費</span>
        <button className="btn-open-cat" onClick={onManage}>
          固定費管理
        </button>
      </div>

      {loading ? (
        <p className="fixed-panel-loading">読み込み中…</p>
      ) : (
        <ul className="fixed-panel-list">
          {items.map((item) => (
            <li key={item.fixed_expense_id} className="fixed-panel-item">
              <span className="fixed-panel-icon">
                {ICON_MAP[item.icon_key] ?? "📌"}
              </span>
              <span className="fixed-panel-name" title={item.name}>
                {item.name}
              </span>
              <span className="fixed-panel-amount">
                {item.amount > 0 ? `¥${fmt(item.amount)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="fixed-panel-total">
        固定費合計: <strong>¥{fmt(total)}</strong>
      </div>
    </div>
  );
}
