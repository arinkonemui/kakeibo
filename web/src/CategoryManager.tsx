import { useState } from "react";
import { createCategory, deleteCategory, updateCategory } from "./api";
import type { CategoryRow } from "./types";

interface Props {
  categories: CategoryRow[];
  onClose: () => void;
  onRefetch: () => void;
  showConfirm: (message: string) => Promise<boolean>;
}

export function CategoryManager({ categories, onClose, onRefetch, showConfirm }: Props) {
  // Only show active categories; sorted by sort_order then name
  const [localCats, setLocalCats] = useState<CategoryRow[]>(
    [...categories]
      .filter((c) => c.is_active === 1)
      .sort((a, b) => {
        const sa = a.sort_order ?? 9999;
        const sb = b.sort_order ?? 9999;
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name, "ja");
      }),
  );

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const [newName, setNewName] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // --- Add ---
  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    const result = await createCategory(trimmed, "both");
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setLocalCats((prev) => [...prev, result.category]);
    setNewName("");
    onRefetch();
  };

  // --- Edit start ---
  const startEdit = (cat: CategoryRow) => {
    setEditId(cat.category_id);
    setEditName(cat.name);
    setError(null);
  };

  // --- Edit save ---
  const handleEditSave = async (categoryId: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    const result = await updateCategory(categoryId, { name: trimmed, kind: "both" });
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setLocalCats((prev) =>
      prev.map((c) => (c.category_id === categoryId ? result.category : c)),
    );
    setEditId(null);
    onRefetch();
  };

  // --- Delete ---
  const handleDelete = async (cat: CategoryRow) => {
    const ok = await showConfirm(`「${cat.name}」を削除しますか？\nこのカテゴリの明細データも削除されます。`);
    if (!ok) return;
    setLoading(true);
    setError(null);
    const result = await deleteCategory(cat.category_id);
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setLocalCats((prev) => prev.filter((c) => c.category_id !== cat.category_id));
    onRefetch();
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <div className="category-manager-overlay" onClick={handleClose}>
      <div className="category-manager" onClick={(e) => e.stopPropagation()}>
        <h3>
          カテゴリ管理
          <button className="modal-close" onClick={handleClose}>✕</button>
        </h3>

        {error && <p className="cat-error">{error}</p>}

        <ul className="cat-list">
          {localCats.length === 0 && (
            <li style={{ color: "#aaa", fontSize: "0.85rem" }}>カテゴリがありません</li>
          )}
          {localCats.map((cat) => (
            <li key={cat.category_id} className="cat-item">
              {editId === cat.category_id ? (
                <>
                  <input
                    className="cat-edit-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleEditSave(cat.category_id)}
                    autoFocus
                  />
                  <button
                    className="btn-cat-save"
                    onClick={() => handleEditSave(cat.category_id)}
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
                  <span className="cat-item-name">{cat.name}</span>
                  <button
                    className="btn-cat-edit"
                    onClick={() => startEdit(cat)}
                    disabled={loading}
                  >
                    編集
                  </button>
                  <button
                    className="btn-cat-delete"
                    onClick={() => handleDelete(cat)}
                    disabled={loading}
                  >
                    削除
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>

        <div className="cat-form">
          <h4>新規カテゴリを追加</h4>
          <div className="cat-form-row">
            <input
              type="text"
              placeholder="カテゴリ名（例：食費）"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              maxLength={50}
            />
            <button
              className="btn-add"
              onClick={handleAdd}
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
