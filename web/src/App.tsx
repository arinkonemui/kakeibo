import { useCallback, useMemo, useState } from "react";
import { saveMonthly } from "./api";
import { DevUserBar } from "./DevUserBar";
import { EntryModal } from "./EntryModal";
import { isEditableMonth } from "./monthUtils";
import { MonthlyTable } from "./MonthlyTable";
import type { CreateEntryOp, EntryRow } from "./types";
import { useMonthly } from "./useMonthly";
import { useOpsQueue } from "./useOpsQueue";

/** Get current month as YYYY-MM */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

interface ModalState {
  date: string;
  categoryId: string;
}

export function App() {
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const { data, loading, error, refetch } = useMonthly(monthKey);
  const ops = useOpsQueue();

  // Modal state
  const [modal, setModal] = useState<ModalState | null>(null);

  // Save status
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);

  const editable = isEditableMonth(monthKey);

  // --- Month navigation with unsaved-changes guard ---
  const guardedSetMonthKey = useCallback(
    (newKey: string) => {
      if (ops.isDirty) {
        if (!confirm("未保存の変更があります。破棄しますか？")) return;
        ops.reset();
      }
      setModal(null);
      setSaveError(null);
      setConflictMsg(null);
      setMonthKey(newKey);
    },
    [ops],
  );

  const handleDevChange = useCallback(() => {
    ops.reset();
    setModal(null);
    setSaveError(null);
    setConflictMsg(null);
    setTimeout(refetch, 50);
  }, [ops, refetch]);

  // --- Merge local entries for display ---
  const localCreateIds = useMemo(
    () => new Set(ops.queue.creates.map((c) => c.entry_id!)),
    [ops.queue.creates],
  );

  const localEntries: EntryRow[] = useMemo(() => {
    if (!data) return [];
    const deleteSet = new Set(ops.queue.deleteIds);
    // Server entries minus deleted ones
    const kept = data.entries.filter((e) => !deleteSet.has(e.entry_id));
    // Local creates as pseudo-EntryRow
    const created: EntryRow[] = ops.queue.creates.map((c) => ({
      entry_id: c.entry_id!,
      user_id: "",
      month_key: monthKey,
      date: c.date,
      type: c.type,
      amount: c.amount,
      category_id: c.category_id,
      memo: c.memo ?? null,
      payment_method: c.payment_method ?? null,
      created_at: "",
      updated_at: "",
    }));
    return [...kept, ...created];
  }, [data, ops.queue, monthKey]);

  // --- Cell click handler ---
  const handleCellClick = useCallback(
    (date: string, categoryId: string) => {
      setModal({ date, categoryId });
    },
    [],
  );

  // --- Modal callbacks ---
  const handleAddEntry = useCallback(
    (op: CreateEntryOp) => {
      ops.addEntry(op);
    },
    [ops],
  );

  const handleDeleteEntry = useCallback(
    (entryId: string, isLocalOnly: boolean) => {
      ops.removeEntry(entryId, isLocalOnly);
    },
    [ops],
  );

  // --- Save handler ---
  const handleSave = useCallback(async () => {
    if (!data || !ops.isDirty) return;
    setSaving(true);
    setSaveError(null);
    setConflictMsg(null);

    const version = data.month?.version ?? 0;
    const result = await saveMonthly(monthKey, version, ops.buildSaveOps());

    if ("conflict" in result) {
      setConflictMsg(result.message);
      setSaving(false);
      return;
    }
    if ("error" in result) {
      setSaveError(result.error);
      setSaving(false);
      return;
    }

    // Success — clear queue and refetch
    ops.reset();
    setModal(null);
    setSaving(false);
    refetch();
  }, [data, monthKey, ops, refetch]);

  // --- Conflict reload ---
  const handleConflictReload = useCallback(() => {
    ops.reset();
    setConflictMsg(null);
    setModal(null);
    refetch();
  }, [ops, refetch]);

  // --- Modal entries for the selected cell ---
  const modalEntries = useMemo(() => {
    if (!modal) return [];
    return localEntries.filter(
      (e) => e.date === modal.date && e.category_id === modal.categoryId,
    );
  }, [modal, localEntries]);

  const modalCategoryName = useMemo(() => {
    if (!modal || !data) return "";
    return data.categories.find((c) => c.category_id === modal.categoryId)?.name ?? "";
  }, [modal, data]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>おさいふノート</h1>
        <p className="catchphrase">
          1か月を一目で見渡す。 見開きカレンダー型のシンプル家計簿。
        </p>
      </header>

      <DevUserBar onChange={handleDevChange} />

      <div className="month-selector">
        <button
          onClick={() => {
            const [y, m] = monthKey.split("-").map(Number);
            const prev = new Date(y!, m! - 2, 1);
            guardedSetMonthKey(
              `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`,
            );
          }}
        >
          ◀ 前月
        </button>

        <input
          type="month"
          value={monthKey}
          onChange={(e) => guardedSetMonthKey(e.target.value)}
        />

        <button onClick={() => guardedSetMonthKey(currentMonthKey())}>今月</button>

        <button
          onClick={() => {
            const [y, m] = monthKey.split("-").map(Number);
            const next = new Date(y!, m!, 1);
            guardedSetMonthKey(
              `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`,
            );
          }}
        >
          次月 ▶
        </button>
      </div>

      {/* Read-only banner */}
      {!editable && data && (
        <div className="read-only-banner">
          この月は閲覧専用です（編集可能期間外）
        </div>
      )}

      {/* Conflict banner */}
      {conflictMsg && (
        <div className="conflict-banner">
          <span>{conflictMsg}</span>
          <button onClick={handleConflictReload}>最新データを取得</button>
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div className="save-error">エラー: {saveError}</div>
      )}

      {loading && <p className="status">読み込み中…</p>}
      {error && <p className="status error">エラー: {error}</p>}

      {data && (
        <MonthlyTable
          data={data}
          monthKey={monthKey}
          localEntries={localEntries}
          editable={editable}
          onCellClick={handleCellClick}
        />
      )}

      {/* Save bar */}
      {editable && ops.isDirty && (
        <div className="save-bar">
          <span>未保存の変更: {ops.pendingCount}件</span>
          <button onClick={handleSave} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
          <button onClick={ops.reset} disabled={saving}>
            変更を破棄
          </button>
        </div>
      )}

      {/* Entry modal */}
      {modal && editable && (
        <EntryModal
          date={modal.date}
          categoryId={modal.categoryId}
          categoryName={modalCategoryName}
          entries={modalEntries}
          localCreateIds={localCreateIds}
          onAdd={handleAddEntry}
          onDelete={handleDeleteEntry}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
