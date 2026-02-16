import { useState } from "react";
import type { CreateEntryOp, EntryRow } from "./types";

const PAYMENT_METHODS = ["", "現金", "クレカ", "銀行引落", "QR", "その他"];

interface Props {
  date: string;
  categoryId: string;
  categoryName: string;
  /** Existing entries for this date+category (server + local creates, minus deletes) */
  entries: EntryRow[];
  /** IDs of entries created locally (not yet saved) */
  localCreateIds: Set<string>;
  onAdd: (op: CreateEntryOp) => void;
  onDelete: (entryId: string, isLocalOnly: boolean) => void;
  onClose: () => void;
}

/** Format number with comma separator */
function fmt(n: number): string {
  return n.toLocaleString("ja-JP");
}

export function EntryModal({
  date,
  categoryId,
  categoryName,
  entries,
  localCreateIds,
  onAdd,
  onDelete,
  onClose,
}: Props) {
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [entryType, setEntryType] = useState<"expense" | "income">("expense");

  const handleAdd = () => {
    const parsed = parseInt(amount, 10);
    if (!parsed || parsed <= 0) return;
    onAdd({
      date,
      type: entryType,
      amount: parsed,
      category_id: categoryId,
      memo: memo || null,
      payment_method: paymentMethod || null,
    });
    setAmount("");
    setMemo("");
    setPaymentMethod("");
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {date} / {categoryName}
          </h3>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Existing entries list */}
        {entries.length > 0 && (
          <div className="modal-entries">
            <h4>明細一覧</h4>
            <ul className="entry-list">
              {entries.map((e) => (
                <li key={e.entry_id} className="entry-item">
                  <span className="entry-amount">
                    {e.type === "income" ? "＋" : ""}¥{fmt(e.amount)}
                  </span>
                  {e.memo && (
                    <span className="entry-memo">{e.memo}</span>
                  )}
                  {e.payment_method && (
                    <span className="entry-pay">{e.payment_method}</span>
                  )}
                  <button
                    className="btn-delete"
                    onClick={() =>
                      onDelete(e.entry_id, localCreateIds.has(e.entry_id))
                    }
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Add entry form */}
        <div className="modal-form">
          <h4>新規追加</h4>
          <div className="form-row">
            <label>
              種別:
              <select
                value={entryType}
                onChange={(e) =>
                  setEntryType(e.target.value as "expense" | "income")
                }
              >
                <option value="expense">支出</option>
                <option value="income">収入</option>
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              金額:
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="例: 500"
                autoFocus
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              メモ:
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="任意"
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              支払方法:
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm || "未選択"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="btn-add" onClick={handleAdd} disabled={!amount || parseInt(amount, 10) <= 0}>
            追加
          </button>
        </div>
      </div>
    </div>
  );
}
