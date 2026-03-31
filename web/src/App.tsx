import { useCallback, useMemo, useState } from "react";
import { AggregateTab } from "./AggregateTab";
import { saveMonthly } from "./api";
import { CategoryManager } from "./CategoryManager";
import { DevUserBar } from "./DevUserBar";
import { EntryModal } from "./EntryModal";
import { ExportTab } from "./ExportTab";
import { isEditableMonth } from "./monthUtils";
import { LoginScreen } from "./LoginScreen";
import { MonthlyTable } from "./MonthlyTable";
import { SettingsTab } from "./SettingsTab";
import type { CreateEntryOp, EntryRow, MonthlyDataset, UpdateEntryOp } from "./types";
import { WeeklyTable } from "./WeeklyTable";
import { useAuth } from "./useAuth";
import { useMonthly } from "./useMonthly";
import { useOpsQueue } from "./useOpsQueue";
import type { ArchiveRow } from "./csvUtils";

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
  { id: "settings", label: "予算" },
  { id: "export", label: "出力" },
];

interface ModalState {
  date: string;
  categoryId: string;
}

export function App() {
  const { token, userId, displayName, login, logout } = useAuth();

  // Show login screen when not authenticated
  if (!token || !userId) {
    return <LoginScreen onLogin={login} />;
  }

  return <AppInner displayName={displayName} onLogout={logout} />;
}

function AppInner({
  displayName,
  onLogout,
}: {
  displayName: string | null;
  onLogout: () => void;
}) {
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

  // --- Archive state（過去月の CSV アーカイブ表示用） ---
  const [archive, setArchive] = useState<{
    monthKey: string;
    dataset: MonthlyDataset;
  } | null>(null);

  // アーカイブ表示中は常に読み取り専用。当月インポートは archive を使わず ops キューへ。
  const effectiveData = archive?.dataset ?? data;
  const effectiveMonthKey = archive?.monthKey ?? monthKey;
  const editable = archive ? false : isEditableMonth(monthKey);

  // --- Month navigation with unsaved-changes guard ---
  const guardedSetMonthKey = useCallback(
    (newKey: string) => {
      if (ops.isDirty) {
        if (!confirm("未保存の変更があります。破棄しますか？")) return;
        ops.reset();
      }
      setArchive(null);
      setModal(null);
      setSaveError(null);
      setConflictMsg(null);
      setMonthKey(newKey);
    },
    [ops],
  );

  const handleDevChange = useCallback(() => {
    ops.reset();
    setArchive(null);
    setModal(null);
    setSaveError(null);
    setConflictMsg(null);
    setTimeout(refetch, 50);
  }, [ops, refetch]);

  // --- Archive handlers ---

  /** 過去月：アーカイブ表示モード（読み取り専用） */
  const handleLoadArchive = useCallback(
    (dataset: MonthlyDataset, archMonthKey: string) => {
      setArchive({ monthKey: archMonthKey, dataset });
      setActiveTab("monthly");
    },
    [],
  );

  /** 当月：CSV エントリを ops キューへ取り込み（実カテゴリにマッピング） */
  const handleImportCurrentMonth = useCallback(
    (rows: ArchiveRow[], _archMonthKey: string) => {
      if (!data) return;
      // カテゴリ名 → 実 category_id のマップ
      const catMap = new Map(
        data.categories.map((c) => [c.name, c.category_id]),
      );
      let skipped = 0;
      const creates: CreateEntryOp[] = [];
      for (const row of rows) {
        const catId = catMap.get(row.categoryName);
        if (!catId) {
          skipped++;
          continue;
        }
        creates.push({
          date: row.date,
          type: row.type === "支出" ? "expense" : "income",
          amount: row.amount,
          category_id: catId,
          memo: row.memo || undefined,
          payment_method: row.paymentMethod || undefined,
        });
      }
      for (const c of creates) {
        ops.addEntry(c);
      }
      setActiveTab("monthly");
      if (skipped > 0) {
        setSaveError(
          `${skipped}件のエントリはカテゴリが一致しないためスキップされました。`,
        );
      }
    },
    [data, ops],
  );

  /** アーカイブ表示を終了する */
  const handleClearArchive = useCallback(() => {
    setArchive(null);
    setActiveTab("export");
  }, []);

  // --- Merge local entries for display ---
  const localCreateIds = useMemo(
    () => new Set(ops.queue.creates.map((c) => c.entry_id!)),
    [ops.queue.creates],
  );

  const localEntries: EntryRow[] = useMemo(() => {
    // アーカイブ表示中はアーカイブのエントリをそのまま使う（ops は適用しない）
    if (archive) return archive.dataset.entries;
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
  }, [archive, data, ops.queue, monthKey]);

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
    if (archive) return new Map<string, number>(); // アーカイブ時は日予算なし
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
  }, [archive, data, ops.queue]);

  // --- Modal entries for the selected cell ---
  const modalEntries = useMemo(() => {
    if (!modal) return [];
    return localEntries.filter(
      (e) => e.date === modal.date && e.category_id === modal.categoryId,
    );
  }, [modal, localEntries]);

  const modalCategoryName = useMemo(() => {
    if (!modal || !effectiveData) return "";
    return effectiveData.categories.find((c) => c.category_id === modal.categoryId)?.name ?? "";
  }, [modal, effectiveData]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>おさいふノート</h1>
        <p className="catchphrase">
          1か月を一目で見渡す。 見開きカレンダー型のシンプル家計簿。
        </p>
        {displayName && (
          <div className="app-user-bar">
            <span className="app-user-name">{displayName}</span>
            <button className="btn-logout" onClick={onLogout}>
              ログアウト
            </button>
          </div>
        )}
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

      {/* Archive banner（過去月読み取り専用） */}
      {archive && (
        <div className="archive-mode-banner">
          <span>
            アーカイブ表示のため保存できません（{archive.monthKey}）
          </span>
          <button onClick={handleClearArchive}>閉じる</button>
        </div>
      )}

      {/* Read-only banner */}
      {!archive && !editable && data && (
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

      {!archive && loading && <p className="status">読み込み中…</p>}
      {!archive && error && <p className="status error">エラー: {error}</p>}

      {effectiveData && activeTab === "monthly" && (
        <MonthlyTable
          data={effectiveData}
          monthKey={effectiveMonthKey}
          localEntries={localEntries}
          localDailyBudgets={localDailyBudgets}
          editable={editable}
          onCellClick={handleCellClick}
        />
      )}

      {effectiveData && activeTab === "weekly" && (
        <WeeklyTable
          data={effectiveData}
          monthKey={effectiveMonthKey}
          localEntries={localEntries}
          localDailyBudgets={localDailyBudgets}
          editable={editable}
          onCellClick={handleCellClick}
        />
      )}

      {effectiveData && activeTab === "aggregate" && (
        <AggregateTab
          data={effectiveData}
          monthKey={effectiveMonthKey}
          localEntries={localEntries}
        />
      )}

      {activeTab === "settings" && effectiveData && !archive && (
        <SettingsTab
          data={effectiveData}
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
      {activeTab === "settings" && archive && (
        <div className="tab-placeholder">
          <p>アーカイブ表示中は予算設定を変更できません</p>
        </div>
      )}

      {activeTab === "export" && data && (
        <ExportTab
          monthKey={monthKey}
          data={data}
          localEntries={archive ? [] : localEntries}
          archiveActive={!!archive}
          onLoadArchive={handleLoadArchive}
          onImportCurrentMonth={handleImportCurrentMonth}
          onClearArchive={handleClearArchive}
        />
      )}
      {activeTab === "export" && !data && (
        <div className="tab-placeholder"><p>データを読み込み中です</p></div>
      )}

      {/* Save bar — アーカイブ表示中は非表示 */}
      {!archive && editable && ops.isDirty && (
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
