import { useCallback, useMemo, useState } from "react";
import { saveMonthly } from "./api";
import { CategoryManager } from "./CategoryManager";
import { DevUserBar } from "./DevUserBar";
import { EntryModal } from "./EntryModal";
import { isEditableMonth } from "./monthUtils";
import { MonthlyTable } from "./MonthlyTable";
import { SettingsTab } from "./SettingsTab";
import type { CreateEntryOp, EntryRow, UpdateEntryOp } from "./types";
import { WeeklyTable } from "./WeeklyTable";
import { useMonthly } from "./useMonthly";
import { useOpsQueue } from "./useOpsQueue";

/** Get current month as YYYY-MM */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

type TabId = "monthly" | "weekly" | "aggregate" | "settings" | "export";

const TABS: { id: TabId; label: string }[] = [
  { id: "monthly", label: "月間" },
  { id: "weekly", label: "週間" },
  { id: "aggregate", label: "集計" },
  { id: "settings", label: "設定" },
  { id: "export", label: "出力" },
];

interface ModalState {
  date: string;
  categoryId: string;
}

export function App() {
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const { data, loading, error, refetch } = useMonthly(monthKey);
  const ops = useOpsQueue();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>("monthly");

  // Modal state
  const [modal, setModal] = useState<ModalState | null>(null);
  const [catManagerOpen, setCatManagerOpen] = useState(false);

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
    const updateMap = new Map(
      ops.queue.updates.map((u) => [u.entry_id, u]),
    );
    // Server entries minus deleted ones, with updates applied
    const kept = data.entries
      .filter((e) => !deleteSet.has(e.entry_id))
      .map((e) => {
        const upd = updateMap.get(e.entry_id);
        if (!upd) return e;
        return {
          ...e,
          date: upd.date,
          type: upd.type,
          amount: upd.amount,
          category_id: upd.category_id,
          memo: upd.memo ?? null,
          payment_method: upd.payment_method ?? null,
        };
      });
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

  const handleUpdateEntry = useCallback(
    (op: UpdateEntryOp) => {
      ops.updateEntry(op);
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

  // --- Merge local daily budgets for display ---
  const localDailyBudgets = useMemo(() => {
    const map = new Map<string, number>();
    if (data) {
      for (const db of data.daily_budgets) {
        map.set(db.date, db.daily_budget_override);
      }
    }
    for (const date of ops.queue.deleteDailyBudgetDates) {
      map.delete(date);
    }
    for (const u of ops.queue.dailyBudgetUpserts) {
      map.set(u.date, u.daily_budget_override);
    }
    return map;
  }, [data, ops.queue]);

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

      <div className="month-selector-sub">
        <button className="btn-open-cat" onClick={() => setCatManagerOpen(true)}>
          ⚙ カテゴリ管理
        </button>
      </div>

      {/* Tab bar */}
      <nav className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-item${activeTab === tab.id ? " tab-item--active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

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

      {data && activeTab === "monthly" && (
        <MonthlyTable
          data={data}
          monthKey={monthKey}
          localEntries={localEntries}
          localDailyBudgets={localDailyBudgets}
          editable={editable}
          onCellClick={handleCellClick}
        />
      )}

      {data && activeTab === "weekly" && (
        <WeeklyTable
          data={data}
          monthKey={monthKey}
          localEntries={localEntries}
          localDailyBudgets={localDailyBudgets}
          editable={editable}
          onCellClick={handleCellClick}
        />
      )}

      {activeTab === "aggregate" && (
        <div className="tab-placeholder">
          <p>集計タブは準備中です</p>
        </div>
      )}

      {activeTab === "settings" && data && (
        <SettingsTab
          data={data}
          monthKey={monthKey}
          localDailyBudgets={localDailyBudgets}
          editable={editable}
          onSetDailyBudget={ops.setDailyBudget}
          onDeleteDailyBudget={ops.deleteDailyBudget}
          onBudgetSaved={() => {
            ops.reset();
            refetch();
          }}
        />
      )}

      {activeTab === "export" && (
        <div className="tab-placeholder">
          <p>出力タブは準備中です</p>
        </div>
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
          onUpdate={handleUpdateEntry}
          onDelete={handleDeleteEntry}
          onClose={() => setModal(null)}
        />
      )}

      {catManagerOpen && data && (
        <CategoryManager
          categories={data.categories}
          onClose={() => setCatManagerOpen(false)}
          onRefetch={() => {
            setCatManagerOpen(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}
