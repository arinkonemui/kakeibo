import { useState } from "react";
import type { CreateEntryOp, EntryRow, UpdateEntryOp } from "./types";
import { useModalClose } from "./useModalClose";

const PAYMENT_METHODS = ["", "現金", "クレカ", "銀行引落", "QR", "その他"];

interface Props {
  date: string;
  categoryId: string;
  categoryName: string;
  entries: EntryRow[];
  localCreateIds: Set<string>;
  onAdd: (op: CreateEntryOp) => void;
  onUpdate: (op: UpdateEntryOp) => void;
  onDelete: (entryId: string, isLocalOnly: boolean) => void;
  onClose: () => void;
}

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
  onUpdate,
  onDelete,
  onClose,
}: Props) {
  const { closing, handleClose } = useModalClose(onClose);
  // Which entry is being edited (null = 新規追加モード)
  const [editEntry, setEditEntry] = useState<EntryRow | null>(null);

  // Shared form fields
  const entryType = "expense" as const;
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  const isEditing = editEntry !== null;

  // Switch to edit mode for a given entry
  const startEdit = (e: EntryRow) => {
    setEditEntry(e);
    setAmount(String(e.amount));
    setMemo(e.memo ?? "");
    setPaymentMethod(e.payment_method ?? "");
  };

  // Cancel edit → back to 新規追加 mode
  const cancelEdit = () => {
    setEditEntry(null);
    setAmount("");
    setMemo("");
    setPaymentMethod("");
  };

  // 保存（編集モード）
  const handleSave = () => {
    if (!editEntry) return;
    const parsed = parseInt(amount, 10);
    if (!parsed || parsed <= 0) return;
    onUpdate({
      entry_id: editEntry.entry_id,
      date,
      type: entryType,
      amount: parsed,
      category_id: categoryId,
      memo: memo || null,
      payment_method: paymentMethod || null,
    });
    cancelEdit();
  };

  // 追加（新規追加モード）
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

  const amountValid = !!amount && parseInt(amount, 10) > 0;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className={`modal-content${closing ? " closing" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{date} / {categoryName}</h3>
          <button className="modal-close" onClick={handleClose}>✕</button>
        </div>

        {/* 明細一覧 */}
        {entries.length > 0 && (
          <div className="modal-entries">
            <h4>明細一覧</h4>
            <ul className="entry-list">
              {entries.map((e) => (
                <li
                  key={e.entry_id}
                  className={`entry-item${editEntry?.entry_id === e.entry_id ? " entry-item--editing" : ""}`}
                >
                  <span className="entry-amount">
                    {e.type === "income" ? "＋" : ""}¥{fmt(e.amount)}
                  </span>
                  {e.memo && <span className="entry-memo">{e.memo}</span>}
                  {e.payment_method && (
                    <span className="entry-pay">{e.payment_method}</span>
                  )}
                  <span className="entry-spacer" />
                  <button
                    className="btn-cat-edit"
                    onClick={() => startEdit(e)}
                  >
                    編集
                  </button>
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

        {/* 新規追加 / 明細編集フォーム */}
        <div className="modal-form">
          <h4>{isEditing ? "明細編集" : "新規追加"}</h4>

          <div className="form-row">
            <label>
              金額:
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="例: 500"
                autoFocus={!isEditing}
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

          <div className="form-actions">
            {isEditing ? (
              <>
                <button
                  className="btn-add"
                  onClick={handleSave}
                  disabled={!amountValid}
                >
                  変更
                </button>
                <button className="btn-cancel" onClick={cancelEdit}>
                  キャンセル
                </button>
              </>
            ) : (
              <button
                className="btn-add"
                onClick={handleAdd}
                disabled={!amountValid}
              >
                追加
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
