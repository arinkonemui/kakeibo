/**
 * FixedExpensesManager — 固定費カテゴリ（名前・アイコン）の追加/編集/削除モーダル
 * CategoryManager と同じ構造。金額の編集はパネル本体で行う。
 */
import { useState } from "react";
import type { UseFixedExpensesReturn } from "./useFixedExpenses";
import type { FixedExpenseRow } from "./types";

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

const ICON_OPTIONS = [
  { key: "home",      label: "🏠 家" },
  { key: "flame",     label: "🔥 ガス" },
  { key: "faucet",    label: "🚰 水道" },
  { key: "bulb",      label: "💡 電気" },
  { key: "phone",     label: "📶 通信" },
  { key: "train",     label: "🚇 交通" },
  { key: "monitor",   label: "🖥️ インターネット" },
  { key: "clothes",   label: "👕 洋服" },
  { key: "cosmetics", label: "💄 コスメ" },
  { key: "furniture", label: "🛏️ 家具" },
  { key: "car",       label: "🚗 車" },
  { key: "food",      label: "🍽️ 食事" },
  { key: "cafe",      label: "☕ カフェ" },
  { key: "video",     label: "🎬 動画" },
  { key: "book",      label: "📚 書籍" },
  { key: "music",     label: "🎵 音楽" },
  { key: "education", label: "🎓 教育" },
  { key: "game",      label: "🎮 ゲーム" },
  { key: "custom",    label: "📌 その他" },
];

interface Props {
  items: FixedExpenseRow[];
  onClose: () => void;
  showConfirm: (message: string) => Promise<"ok" | "alt" | "cancel">;
  fx: Pick<UseFixedExpensesReturn, "handleAdd" | "handleDelete" | "handleUpdateMeta">;
  initialTab?: "expense" | "income";
}

export function FixedExpensesManager({ items, onClose, showConfirm, fx, initialTab }: Props) {
  const [tab, setTab] = useState<"expense" | "income">(initialTab ?? "expense");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIconKey, setEditIconKey] = useState("custom");

  const [newName, setNewName] = useState("");
  const [newIconKey, setNewIconKey] = useState("custom");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const visibleItems = items.filter((i) =>
    tab === "income" ? i.entry_type === "income" : i.entry_type !== "income"
  );

  const switchTab = (t: "expense" | "income") => {
    setTab(t);
    setEditId(null);
    setNewName("");
    setNewIconKey("custom");
    setError(null);
  };

  // --- Add ---
  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setError("名前を入力してください。");
      return;
    }
    setLoading(true);
    setError(null);
    const err = await fx.handleAdd(trimmed, newIconKey, 0, tab);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    setNewName("");
    setNewIconKey("custom");
  };

  // --- Edit start ---
  const startEdit = (item: FixedExpenseRow) => {
    setEditId(item.fixed_expense_id);
    setEditName(item.name);
    setEditIconKey(item.icon_key);
    setError(null);
  };

  // --- Edit save ---
  const handleEditSave = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setError("名前を入力してください。");
      return;
    }
    setLoading(true);
    setError(null);
    const err = await fx.handleUpdateMeta(id, { name: trimmed, icon_key: editIconKey });
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    setEditId(null);
  };

  // --- Delete ---
  const handleDelete = async (item: FixedExpenseRow) => {
    const confirmed = await showConfirm(`「${item.name}」を削除しますか？`);
    if (confirmed !== "ok") return;
    setLoading(true);
    setError(null);
    const err = await fx.handleDelete(item);
    setLoading(false);
    if (err) setError(err);
  };

  return (
    <div className="category-manager-overlay" onClick={onClose}>
      <div className="category-manager" onClick={(e) => e.stopPropagation()}>
        <h3>
          固定費カテゴリ管理
          <button className="modal-close" onClick={onClose}>✕</button>
        </h3>

        <div className="fe-manager-tabs">
          <button
            className={`fe-manager-tab${tab === "expense" ? " active" : ""}`}
            onClick={() => switchTab("expense")}
          >
            固定費
          </button>
          <button
            className={`fe-manager-tab${tab === "income" ? " active" : ""}`}
            onClick={() => switchTab("income")}
          >
            収入
          </button>
        </div>

        {error && <p className="cat-error">{error}</p>}

        <ul className="cat-list">
          {visibleItems.length === 0 && (
            <li style={{ color: "#aaa", fontSize: "0.85rem" }}>
              {tab === "income" ? "収入がありません" : "固定費がありません"}
            </li>
          )}
          {visibleItems.map((item) => (
            <li key={item.fixed_expense_id} className="cat-item">
              {editId === item.fixed_expense_id ? (
                <>
                  <select
                    className="fe-manager-icon-select"
                    value={editIconKey}
                    onChange={(e) => setEditIconKey(e.target.value)}
                  >
                    {ICON_OPTIONS.map((opt) => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>
                  <input
                    className="cat-edit-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void handleEditSave(item.fixed_expense_id)}
                    autoFocus
                    maxLength={50}
                  />
                  <button
                    className="btn-cat-save"
                    onClick={() => void handleEditSave(item.fixed_expense_id)}
                    disabled={loading}
                  >
                    保存
                  </button>
                  <button
                    className="btn-cat-cancel"
                    onClick={() => setEditId(null)}
                    disabled={loading}
                  >
                    キャンセル
                  </button>
                </>
              ) : (
                <>
                  <span className="fe-manager-icon">
                    {ICON_MAP[item.icon_key] ?? "📌"}
                  </span>
                  <span className="cat-item-name">{item.name}</span>
                  <button
                    className="btn-cat-edit"
                    onClick={() => startEdit(item)}
                    disabled={loading}
                  >
                    編集
                  </button>
                  {item.is_default === 0 && (
                    <button
                      className="btn-cat-delete"
                      onClick={() => void handleDelete(item)}
                      disabled={loading}
                    >
                      削除
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>

        <div className="cat-form">
          <h4>{tab === "income" ? "収入を追加" : "固定費を追加"}</h4>
          <div className="cat-form-row">
            <select
              className="fe-manager-icon-select"
              value={newIconKey}
              onChange={(e) => setNewIconKey(e.target.value)}
            >
              {ICON_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="例: 家賃"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleAdd()}
              maxLength={50}
            />
            <button
              className="btn-add"
              onClick={() => void handleAdd()}
              disabled={loading || !newName.trim()}
            >
              追加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
