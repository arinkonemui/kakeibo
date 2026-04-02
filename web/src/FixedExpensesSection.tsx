import { useEffect, useState } from "react";
import {
  createFixedExpense,
  deleteFixedExpense,
  fetchFixedExpenses,
  updateFixedExpense,
} from "./api";
import type { FixedExpenseRow } from "./types";

const ICON_MAP: Record<string, string> = {
  home:   "🏠",
  flame:  "🔥",
  faucet: "🚰",
  bulb:   "💡",
  phone:  "📶",
  custom: "📌",
};

const ICON_OPTIONS = [
  { key: "home",   label: "🏠 家" },
  { key: "flame",  label: "🔥 炎" },
  { key: "faucet", label: "🚰 水道" },
  { key: "bulb",   label: "💡 電球" },
  { key: "phone",  label: "📶 通信" },
  { key: "custom", label: "📌 その他" },
];

function fmt(n: number): string {
  return n.toLocaleString("ja-JP");
}

export function FixedExpensesSection() {
  const [items, setItems] = useState<FixedExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // id → 入力中の金額文字列
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIconKey, setNewIconKey] = useState("custom");
  const [newAmount, setNewAmount] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  // 初回ロード
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFixedExpenses()
      .then((data) => {
        if (cancelled) return;
        setItems(data);
        const drafts: Record<string, string> = {};
        for (const item of data) {
          drafts[item.fixed_expense_id] = item.amount === 0 ? "" : String(item.amount);
        }
        setDraftAmounts(drafts);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // savedMsg 自動クリア（2秒後）
  useEffect(() => {
    if (!savedMsg) return;
    const t = setTimeout(() => setSavedMsg(false), 2000);
    return () => clearTimeout(t);
  }, [savedMsg]);

  const reload = async () => {
    const data = await fetchFixedExpenses();
    setItems(data);
    const drafts: Record<string, string> = {};
    for (const item of data) {
      drafts[item.fixed_expense_id] = item.amount === 0 ? "" : String(item.amount);
    }
    setDraftAmounts(drafts);
  };

  // 変更のあるアイテムのみ PATCH して再ロード
  const handleSaveAll = async () => {
    setSaving(true);
    setSavedMsg(false);
    const updates = items
      .filter((item) => {
        const draft = draftAmounts[item.fixed_expense_id] ?? "";
        const parsed = draft === "" ? 0 : parseInt(draft, 10);
        return !isNaN(parsed) && parsed >= 0 && parsed !== item.amount;
      })
      .map((item) => {
        const draft = draftAmounts[item.fixed_expense_id] ?? "";
        const amount = draft === "" ? 0 : parseInt(draft, 10);
        return updateFixedExpense(item.fixed_expense_id, { amount });
      });
    await Promise.all(updates);
    await reload();
    setSaving(false);
    setSavedMsg(true);
  };

  const handleDelete = async (item: FixedExpenseRow) => {
    const res = await deleteFixedExpense(item.fixed_expense_id);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setItems((prev) => prev.filter((i) => i.fixed_expense_id !== item.fixed_expense_id));
    setDraftAmounts((prev) => {
      const next = { ...prev };
      delete next[item.fixed_expense_id];
      return next;
    });
  };

  const handleAdd = async () => {
    const trimmedName = newName.trim();
    if (!trimmedName) {
      setAddError("名前を入力してください。");
      return;
    }
    const amount = newAmount === "" ? 0 : parseInt(newAmount, 10);
    if (isNaN(amount) || amount < 0) {
      setAddError("金額は0以上の整数を入力してください。");
      return;
    }
    setAddLoading(true);
    setAddError(null);
    const res = await createFixedExpense(trimmedName, newIconKey, amount);
    setAddLoading(false);
    if ("error" in res) {
      setAddError(res.error);
      return;
    }
    const newItem = res.item;
    setItems((prev) => [...prev, newItem]);
    setDraftAmounts((prev) => ({
      ...prev,
      [newItem.fixed_expense_id]: newItem.amount === 0 ? "" : String(newItem.amount),
    }));
    setNewName("");
    setNewIconKey("custom");
    setNewAmount("");
    setShowAddForm(false);
  };

  return (
    <section className="settings-section">
      <h3>固定費</h3>

      {loading && <p className="empty-message">読み込み中…</p>}
      {error && <p className="budget-error">エラー: {error}</p>}

      {!loading && (
        <>
          {items.length > 0 ? (
            <div className="fixed-expense-grid">
              {items.map((item) => (
                <div key={item.fixed_expense_id} className="fixed-expense-card">
                  <span className="fixed-expense-icon">
                    {ICON_MAP[item.icon_key] ?? "📌"}
                  </span>
                  <span className="fixed-expense-name" title={item.name}>
                    {item.name}
                  </span>
                  <input
                    type="number"
                    min="0"
                    className="fixed-expense-amount-input"
                    value={draftAmounts[item.fixed_expense_id] ?? ""}
                    onChange={(e) =>
                      setDraftAmounts((prev) => ({
                        ...prev,
                        [item.fixed_expense_id]: e.target.value,
                      }))
                    }
                    placeholder="0"
                  />
                  {item.is_default === 0 && (
                    <button
                      className="btn-delete fixed-expense-delete"
                      onClick={() => void handleDelete(item)}
                    >
                      削除
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-message">固定費はまだ登録されていません。</p>
          )}

          {/* 合計表示 */}
          {items.length > 0 && (() => {
            const total = items.reduce((sum, item) => {
              const draft = draftAmounts[item.fixed_expense_id] ?? "";
              const v = draft === "" ? 0 : parseInt(draft, 10);
              return sum + (isNaN(v) ? 0 : v);
            }, 0);
            return (
              <p className="fixed-expense-total">
                合計: <strong>¥{fmt(total)}</strong>
              </p>
            );
          })()}

          <div className="form-actions" style={{ marginTop: "10px" }}>
            <button className="btn-add" onClick={() => void handleSaveAll()} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </button>
            <button
              className="btn-add fixed-expense-add-btn"
              onClick={() => {
                setShowAddForm(true);
                setAddError(null);
              }}
            >
              固定費を追加
            </button>
          </div>

          {savedMsg && <p className="budget-saved">保存しました</p>}

          {showAddForm && (
            <div className="fixed-expense-add-form">
              <label>
                名前
                <input
                  type="text"
                  maxLength={50}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例: 家賃"
                />
              </label>
              <label>
                アイコン
                <select
                  value={newIconKey}
                  onChange={(e) => setNewIconKey(e.target.value)}
                >
                  {ICON_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                金額
                <input
                  type="number"
                  min="0"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="0"
                />
              </label>
              <div className="fixed-expense-add-actions">
                <button className="btn-add" onClick={() => void handleAdd()} disabled={addLoading}>
                  {addLoading ? "追加中…" : "追加"}
                </button>
                <button
                  className="btn-cancel"
                  onClick={() => {
                    setShowAddForm(false);
                    setAddError(null);
                  }}
                >
                  キャンセル
                </button>
              </div>
              {addError && <p className="budget-error">{addError}</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
