import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AggregateTab } from "./AggregateTab";
import { fetchMonthlyDataset, saveMonthly, updateCategory, verifyEmail } from "./api";
import { CategoryManager } from "./CategoryManager";
import { ConfirmDialog } from "./ConfirmDialog";
import { downloadCsvWithPicker, generateEntriesCsv } from "./csvUtils";
import { EntryModal } from "./EntryModal";
import { ExportTab } from "./ExportTab";
import { FixedExpensesManager } from "./FixedExpensesManager";
import { FixedExpensesPanel } from "./FixedExpensesPanel";
import { isEditableMonth } from "./monthUtils";
import { LoginScreen } from "./LoginScreen";
import { MonthlyTable } from "./MonthlyTable";
import { ProfileModal } from "./ProfileModal";
import { SettingsTab } from "./SettingsTab";
import { createFixedExpense, fetchFixedExpenses, updateFixedExpense } from "./api";
import type { FixedExpenseCsvRow } from "./csvUtils";
import type { CreateEntryOp, EntryRow, MonthlyDataset, UpdateEntryOp } from "./types";
import { WeeklyTable } from "./WeeklyTable";
import { useAuth } from "./useAuth";
import { useFixedExpenses } from "./useFixedExpenses";
import { useIsMobile } from "./useIsMobile";
import { useMonthly } from "./useMonthly";
import { useOpsQueue } from "./useOpsQueue";
import { MobileMonthlyView } from "./MobileMonthlyView";
import { MobileFixedPanelModal } from "./MobileFixedPanelModal";

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
  const { token, userId, displayName, login, logout, updateDisplayName } = useAuth();
  const [verifyState, setVerifyState] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [verifyMsg, setVerifyMsg] = useState("");

  // URLの ?verify= パラメータを検知してメール確認を実行
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifyToken = params.get("verify");
    if (!verifyToken) return;

    // URLからトークンを除去
    const url = new URL(window.location.href);
    url.searchParams.delete("verify");
    window.history.replaceState({}, "", url.toString());

    setVerifyState("verifying");
    verifyEmail(verifyToken).then((res) => {
      if ("error" in res) {
        setVerifyState("error");
        setVerifyMsg(res.error);
      } else {
        setVerifyState("success");
        // 確認成功 → 自動ログイン
        login(res.token, res.userId, res.displayName);
      }
    });
  }, []);

  // メール確認中/結果表示
  if (verifyState === "verifying") {
    return (
      <div className="login-screen">
        <div className="login-card" style={{ textAlign: "center" }}>
          <h1 className="login-brand">おさいふノート</h1>
          <p>メールアドレスを確認中...</p>
        </div>
      </div>
    );
  }
  if (verifyState === "error") {
    return (
      <div className="login-screen">
        <div className="login-card" style={{ textAlign: "center" }}>
          <h1 className="login-brand">おさいふノート</h1>
          <p className="login-error">{verifyMsg}</p>
          <button className="btn-text-link" onClick={() => setVerifyState("idle")}>
            ログイン画面へ
          </button>
        </div>
      </div>
    );
  }

  // Show login screen when not authenticated
  if (!token || !userId) {
    return <LoginScreen onLogin={login} />;
  }

  return <AppInner displayName={displayName} onLogout={logout} onUpdateDisplayName={updateDisplayName} />;
}

function AppInner({
  displayName,
  onLogout,
  onUpdateDisplayName,
}: {
  displayName: string | null;
  onLogout: () => void;
  onUpdateDisplayName: (name: string) => void;
}) {
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const { data, loading, error, refetch } = useMonthly(monthKey);
  const ops = useOpsQueue();
  const fx = useFixedExpenses(monthKey);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>("monthly");

  // Mobile
  const isMobile = useIsMobile();
  const [mobileFixedType, setMobileFixedType] = useState<"expense" | "income" | null>(null);

  // Modal state
  const [modal, setModal] = useState<ModalState | null>(null);
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [feManagerOpen, setFeManagerOpen] = useState(false);
  const [feManagerInitialTab, setFeManagerInitialTab] = useState<"expense" | "income">("expense");

  // Profile modal
  const [profileOpen, setProfileOpen] = useState(false);

  // Save status
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);

  // --- Archive state（過去月の CSV アーカイブ表示用） ---
  const [archive, setArchive] = useState<{
    monthKey: string;
    dataset: MonthlyDataset;
    fixedRows?: FixedExpenseCsvRow[];
  } | null>(null);
  const [archiveCommitting, setArchiveCommitting] = useState(false);
  const [archiveCommitError, setArchiveCommitError] = useState<string | null>(null);

  // --- Custom confirm dialog (2択 or 3択) ---
  type ConfirmResult = "ok" | "alt" | "cancel";
  interface ConfirmOpts { okLabel?: string; cancelLabel?: string; altLabel?: string }
  const [confirmState, setConfirmState] = useState<{
    message: string;
    opts?: ConfirmOpts;
  } | null>(null);
  const confirmResolveRef = useRef<((v: ConfirmResult) => void) | null>(null);
  const showConfirm = useCallback(
    (message: string, opts?: ConfirmOpts): Promise<ConfirmResult> => {
      return new Promise((resolve) => {
        confirmResolveRef.current = resolve;
        setConfirmState({ message, opts });
      });
    },
    [],
  );
  const resolveConfirm = useCallback((result: ConfirmResult) => {
    confirmResolveRef.current?.(result);
    confirmResolveRef.current = null;
    setConfirmState(null);
  }, []);

  // アーカイブ表示中は常に読み取り専用
  const effectiveData = archive?.dataset ?? data;
  const effectiveMonthKey = archive?.monthKey ?? monthKey;
  const editable = archive ? false : isEditableMonth(monthKey);

  // --- Month navigation with unsaved-changes guard ---
  const guardedSetMonthKey = useCallback(
    async (newKey: string) => {
      if (ops.isDirty) {
        const result = await showConfirm("未保存の変更があります。破棄しますか？");
        if (result !== "ok") return;
        ops.reset();
      }
      setArchive(null);
      setModal(null);
      setSaveError(null);
      setConflictMsg(null);
      setMonthKey(newKey);
    },
    [ops, showConfirm],
  );

  // --- Archive handlers ---

  /** アーカイブ読み込み（全月共通）：表示のみ、存在チェックなし */
  const handleLoadArchive = useCallback(
    (dataset: MonthlyDataset, archMonthKey: string, fixedRows?: FixedExpenseCsvRow[]) => {
      setArchive({ monthKey: archMonthKey, dataset, fixedRows });
      setArchiveCommitError(null);
      setActiveTab("monthly");
    },
    [],
  );

  /** アーカイブを DB へ反映する（存在チェック → 直接保存） */
  const handleCommitArchive = useCallback(async () => {
    if (!archive || !data) return;
    setArchiveCommitting(true);
    setArchiveCommitError(null);

    // 存在チェック
    let existing: MonthlyDataset;
    try {
      existing = await fetchMonthlyDataset(archive.monthKey);
    } catch {
      setArchiveCommitError("データの確認中にエラーが発生しました。");
      setArchiveCommitting(false);
      return;
    }

    // 既存エントリの分類：アクティブカテゴリ vs 削除済みカテゴリ（孤立エントリ）
    const activeCatIds = new Set(
      data.categories.filter((c) => c.is_active === 1).map((c) => c.category_id),
    );
    const activeEntries = existing.entries.filter((e) => activeCatIds.has(e.category_id));
    const orphanedEntries = existing.entries.filter((e) => !activeCatIds.has(e.category_id));

    // アクティブなカテゴリのエントリが残っている場合はブロック
    if (activeEntries.length > 0) {
      setArchiveCommitError(
        `${archive.monthKey}のデータが既に存在するため反映できません。` +
        `先にアプリからこの月のデータを削除してください。`,
      );
      setArchiveCommitting(false);
      return;
    }

    // 孤立エントリ（削除済みカテゴリ）だけ残っている場合 → 確認の上で削除して進む
    if (orphanedEntries.length > 0) {
      const confirmed = await showConfirm(
        `この月には削除済みカテゴリの明細が${orphanedEntries.length}件残っています。\n` +
        `これらを削除してCSVデータを反映しますか？`,
      );
      if (confirmed !== "ok") {
        setArchiveCommitting(false);
        return;
      }
      // 孤立エントリを削除してバージョンを更新
      const cleanupResult = await saveMonthly(archive.monthKey, existing.month?.version ?? 0, {
        delete_entry_ids: orphanedEntries.map((e) => e.entry_id),
      });
      if ("conflict" in cleanupResult) {
        setArchiveCommitError(cleanupResult.message);
        setArchiveCommitting(false);
        return;
      }
      if ("error" in cleanupResult) {
        setArchiveCommitError(cleanupResult.error);
        setArchiveCommitting(false);
        return;
      }
      // 削除後のバージョンを使用
      existing = await fetchMonthlyDataset(archive.monthKey);
    }

    // months レコードが既にある場合はそのバージョンを使う（新規は 0）
    const expectedVersion = existing.month?.version ?? 0;

    // 全カテゴリ（active+inactive）のマップを構築
    const allCatMap = new Map(
      data.categories.map((c) => [c.name, { id: c.category_id, active: c.is_active === 1 }]),
    );

    // エントリを分類
    const activeCreates: CreateEntryOp[] = [];
    const inactiveCreates: CreateEntryOp[] = [];
    const inactiveCatNames = new Set<string>();
    const inactiveCatIds = new Set<string>();
    let unmatchedCount = 0;

    for (const entry of archive.dataset.entries) {
      const archiveCat = archive.dataset.categories.find(
        (c) => c.category_id === entry.category_id,
      );
      const catName = archiveCat?.name;
      const realCat = catName ? allCatMap.get(catName) : undefined;

      if (!realCat) {
        unmatchedCount++;
        continue;
      }

      const op: CreateEntryOp = {
        date: entry.date,
        type: entry.type as "expense" | "income",
        amount: entry.amount,
        category_id: realCat.id,
        memo: entry.memo ?? undefined,
        payment_method: entry.payment_method ?? undefined,
      };

      if (realCat.active) {
        activeCreates.push(op);
      } else {
        inactiveCreates.push(op);
        inactiveCatNames.add(catName!);
        inactiveCatIds.add(realCat.id);
      }
    }

    // 削除済みカテゴリのエントリがある場合 → 復元するか確認
    let creates = [...activeCreates];
    let skipped = unmatchedCount;

    if (inactiveCreates.length > 0) {
      const names = [...inactiveCatNames].join("、");
      const confirmed = await showConfirm(
        `${inactiveCreates.length}件のエントリは削除済みカテゴリに属しています。\n` +
        `対象カテゴリ：${names}\n\n` +
        `対象カテゴリを復元しますか？\n` +
        `「OK」→ カテゴリを復元してエントリも反映\n` +
        `「キャンセル」→ これらのエントリをスキップ`,
      );

      if (confirmed === "ok") {
        // カテゴリ復元（PATCH is_active=1）
        for (const catId of inactiveCatIds) {
          const res = await updateCategory(catId, { is_active: 1 });
          if ("error" in res) {
            setArchiveCommitError(`カテゴリの復元に失敗しました: ${res.error}`);
            setArchiveCommitting(false);
            return;
          }
        }
        creates = [...activeCreates, ...inactiveCreates];
      } else {
        skipped += inactiveCreates.length;
      }
    }

    // 直接 DB 保存（既存 months レコードがあればそのバージョンで、なければ 0）
    const result = await saveMonthly(archive.monthKey, expectedVersion, { create_entries: creates });
    setArchiveCommitting(false);

    if ("conflict" in result) {
      setArchiveCommitError(result.message);
      return;
    }
    if ("error" in result) {
      setArchiveCommitError(result.error);
      return;
    }

    // 固定費・収入を復元（既存項目は金額を更新、なければ新規作成）
    if (archive.fixedRows && archive.fixedRows.length > 0) {
      const existingFixed = await fetchFixedExpenses(archive.monthKey);
      const existingByKey = new Map(
        existingFixed.map((i) => [`${i.entry_type}:${i.name}`, i]),
      );
      for (const row of archive.fixedRows) {
        const existing = existingByKey.get(`${row.entry_type}:${row.name}`);
        if (existing) {
          await updateFixedExpense(existing.fixed_expense_id, { amount: row.amount });
        } else {
          await createFixedExpense(archive.monthKey, row.name, row.icon_key, row.amount, row.entry_type);
        }
      }
      if (archive.monthKey === monthKey) {
        await fx.reload();
      }
    }

    // 成功：反映先月へ移動し通常モードへ
    const targetMonth = archive.monthKey;
    setArchive(null);
    setArchiveCommitError(null);
    ops.reset();
    setMonthKey(targetMonth);
    setActiveTab("monthly");
    // 当月への反映時は monthKey が変わらず useMonthly が自動リフェッチしないため強制リフェッチ
    setTimeout(() => refetch(), 50);
    if (skipped > 0) {
      setSaveError(
        `${skipped}件のエントリはカテゴリが一致しないためスキップされました。`,
      );
    }
  }, [archive, data, monthKey, ops, refetch, fx]);

  /** アーカイブ表示を終了する */
  const handleClearArchive = useCallback(() => {
    setArchive(null);
    setArchiveCommitError(null);
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
    if (!ops.isDirty && !fx.isDirty) return;
    setSaving(true);
    setSaveError(null);
    setConflictMsg(null);

    if (ops.isDirty && data) {
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

      ops.reset();
      setModal(null);
      refetch();
    }

    if (fx.isDirty) {
      await fx.handleSaveAll();
    }

    setSaving(false);
  }, [data, monthKey, ops, refetch, fx]);

  // --- Delete month data ---
  const handleDeleteMonth = useCallback(async () => {
    if (!data) return;
    const hasEntries = data.entries.length > 0;
    const hasBudgets = data.daily_budgets.length > 0;
    const hasFixed = fx.items.some((item) => item.amount !== 0);
    if (!hasEntries && !hasBudgets && !hasFixed) return;

    const result = await showConfirm(
      `${monthKey}のデータを削除しますか？\n削除前にCSVへアーカイブ保存しますか？`,
      { okLabel: "CSVを保存して削除", altLabel: "削除のみ", cancelLabel: "キャンセル" },
    );
    if (result === "cancel") return;

    if (result === "ok" && (hasEntries || hasFixed)) {
      const csv = generateEntriesCsv(data.entries, data.categories, fx.items);
      const saved = await downloadCsvWithPicker(csv, `osaifu_${monthKey}_entries.csv`);
      if (!saved) return; // ユーザーがファイル保存をキャンセル → 削除しない
    }

    setSaving(true);
    setSaveError(null);

    // saveMonthly は entries/budgets 削除に加え months レコードを必ず作成する。
    // months レコードが存在することで固定費 GET の自動シードを抑制できる。
    const deleteResult = await saveMonthly(monthKey, data.month?.version ?? 0, {
      delete_entry_ids: data.entries.map((e) => e.entry_id),
      delete_daily_budget_dates: data.daily_budgets.map((db) => db.date),
    });
    if ("conflict" in deleteResult) {
      setConflictMsg(deleteResult.message);
      setSaving(false);
      return;
    }
    if ("error" in deleteResult) {
      setSaveError(deleteResult.error);
      setSaving(false);
      return;
    }

    if (hasFixed) {
      // カテゴリは残し、金額のみ 0 にリセットする
      for (const item of fx.items) {
        if (item.amount !== 0) {
          await updateFixedExpense(item.fixed_expense_id, { amount: 0 });
        }
      }
      await fx.reload();
    }

    setSaving(false);
    ops.reset();
    setModal(null);
    refetch();
  }, [data, monthKey, ops, showConfirm, refetch, fx]);

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
          1か月を一目で見渡す。<br />見開きカレンダー型のシンプル家計簿。
        </p>
        {displayName && (
          <div className="app-user-bar">
            <span className="app-user-name">{displayName}</span>
            <button className="btn-logout" onClick={onLogout}>
              ログアウト
            </button>
          </div>
        )}

        {/* 固定位置の歯車ボタン */}
        <button
          className="btn-gear-fixed"
          onClick={() => setProfileOpen(true)}
          title="アカウント設定"
          aria-label="アカウント設定"
        >
          ⚙
        </button>
      </header>

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

      {/* Tab bar */}
      <nav className="tab-bar">
        {TABS.filter((tab) => !isMobile || (tab.id !== "weekly" && tab.id !== "export")).map((tab) => (
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
          <div className="archive-banner-actions">
            <button
              className="btn-archive-commit"
              onClick={handleCommitArchive}
              disabled={archiveCommitting || ops.isDirty || fx.isDirty}
            >
              {archiveCommitting ? "反映中…" : "DBへ反映"}
            </button>
            <button onClick={handleClearArchive}>閉じる</button>
          </div>
          {(ops.isDirty || fx.isDirty) && (
            <p className="archive-commit-error">
              未保存の変更があります。アーカイブを閉じて保存または破棄してから再度お試しください。
            </p>
          )}
          {archiveCommitError && (
            <p className="archive-commit-error">{archiveCommitError}</p>
          )}
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

      {(activeTab === "monthly" || activeTab === "weekly") && (() => {
        const calcFx = (items: typeof fx.expenseItems) => items.reduce((s, i) => {
          const draft = fx.draftAmounts[i.fixed_expense_id] ?? "";
          const v = draft === "" ? 0 : parseInt(draft, 10);
          return s + (isNaN(v) ? 0 : v);
        }, 0);
        const fixedTotal = calcFx(fx.expenseItems);
        const incomeFixed = calcFx(fx.incomeItems);
        const expenseTotal = localEntries
          .filter((e) => e.type === "expense")
          .reduce((s, e) => s + e.amount, 0);
        const grandTotal = fixedTotal + expenseTotal;
        const balance = incomeFixed - grandTotal;
        const fmt = (n: number) => n.toLocaleString("ja-JP");

        if (isMobile) {
          return (
            <div className="mobile-layout">
              {/* Mobile summary bar */}
              <div className="mobile-summary-bar">
                <div className="mobile-summary-amounts">
                  <div className="mobile-summary-row">
                    <span>固定費: <strong>¥{fmt(fixedTotal)}</strong></span>
                  </div>
                  <div className="mobile-summary-row">
                    <span>支出額: <strong>¥{fmt(expenseTotal)}</strong></span>
                  </div>
                  <div className="mobile-summary-row">
                    <span>総支出額: <strong>¥{fmt(grandTotal)}</strong></span>
                  </div>
                  <div className="mobile-summary-row">
                    <span>収入額: <strong>¥{fmt(incomeFixed)}</strong></span>
                  </div>
                  <div className="mobile-summary-row">
                    <span>収支差額: <strong style={{ color: balance >= 0 ? "#27ae60" : "#e74c3c" }}>¥{fmt(Math.abs(balance))}</strong></span>
                  </div>
                </div>
                <div className="mobile-summary-buttons">
                  <button className="btn-mobile-panel" onClick={() => setMobileFixedType("expense")}>
                    固定費一覧
                  </button>
                  <button className="btn-mobile-panel" onClick={() => setMobileFixedType("income")}>
                    収入一覧
                  </button>
                </div>
              </div>

              {/* Mobile day view */}
              {effectiveData && (
                <MobileMonthlyView
                  data={effectiveData}
                  monthKey={effectiveMonthKey}
                  localEntries={localEntries}
                  editable={editable}
                  onCellClick={handleCellClick}
                  onOpenCatManager={() => setCatManagerOpen(true)}
                  onMonthChange={guardedSetMonthKey}
                />
              )}
            </div>
          );
        }

        // PC layout
        return (
          <div className="table-with-panel">
            <FixedExpensesPanel
              fx={fx}
              onManageExpense={() => { setFeManagerInitialTab("expense"); setFeManagerOpen(true); }}
              onManageIncome={() => { setFeManagerInitialTab("income"); setFeManagerOpen(true); }}
            />
            <div className="table-main-area">
              <div className="table-toolbar">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  {effectiveData && (
                    <span className="table-summary">
                      収入額: <strong>¥{fmt(incomeFixed)}</strong>
                      <span style={{ display: "inline-block", width: "2em" }} />
                      固定費: <strong>¥{fmt(fixedTotal)}</strong>
                      {" / "}
                      支出額: <strong>¥{fmt(expenseTotal)}</strong>
                      {" / "}
                      総支出額: <strong>¥{fmt(grandTotal)}</strong>
                      <span style={{ display: "inline-block", width: "2em" }} />
                      収支差額: <strong style={{ color: balance >= 0 ? "#27ae60" : "#e74c3c" }}>
                        ¥{fmt(Math.abs(balance))}
                      </strong>
                    </span>
                  )}
                  <button className="btn-open-cat" onClick={() => setCatManagerOpen(true)}>
                    カテゴリ管理
                  </button>
                </div>
              </div>
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
            </div>
          </div>
        );
      })()}

      {effectiveData && activeTab === "aggregate" && (
        <AggregateTab
          data={effectiveData}
          monthKey={effectiveMonthKey}
          localEntries={localEntries}
          fxExpenseItems={fx.expenseItems}
          fxIncomeItems={fx.incomeItems}
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
          onClearArchive={handleClearArchive}
          fxItems={fx.items}
        />
      )}
      {activeTab === "export" && !data && (
        <div className="tab-placeholder"><p>データを読み込み中です</p></div>
      )}

      {/* Delete month bar — 月間・週間タブでデータがある場合のみ */}
      {!archive && editable && data && (data.entries.length > 0 || data.daily_budgets.length > 0 || fx.items.some((item) => item.amount !== 0)) &&
        (activeTab === "monthly" || activeTab === "weekly") && (
        <div className="month-delete-bar">
          <button className="btn-delete-month" onClick={handleDeleteMonth} disabled={saving}>
            この月のデータを削除
          </button>
        </div>
      )}

      {/* Save bar — アーカイブ表示中は非表示 */}
      {!archive && (ops.isDirty || fx.isDirty) && (
        <div className="save-bar">
          <span>
            {ops.isDirty
              ? `未保存の変更: ${ops.pendingCount}件${fx.isDirty ? " + 固定費" : ""}`
              : "固定費/収入に未保存の変更があります"}
          </span>
          <button onClick={handleSave} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
          <button onClick={() => { ops.reset(); fx.resetDrafts(); }} disabled={saving}>
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
          showConfirm={showConfirm}
        />
      )}

      {feManagerOpen && (
        <FixedExpensesManager
          items={fx.items}
          onClose={() => setFeManagerOpen(false)}
          showConfirm={showConfirm}
          fx={fx}
          initialTab={feManagerInitialTab}
        />
      )}

      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          onOk={() => resolveConfirm("ok")}
          onCancel={() => resolveConfirm("cancel")}
          onAlt={confirmState.opts?.altLabel ? () => resolveConfirm("alt") : undefined}
          okLabel={confirmState.opts?.okLabel}
          cancelLabel={confirmState.opts?.cancelLabel}
          altLabel={confirmState.opts?.altLabel}
        />
      )}

      {profileOpen && (
        <ProfileModal
          displayName={displayName}
          onClose={() => setProfileOpen(false)}
          onUpdated={(name) => {
            onUpdateDisplayName(name);
            setProfileOpen(false);
          }}
          onLogout={onLogout}
        />
      )}

      {mobileFixedType && (
        <MobileFixedPanelModal
          type={mobileFixedType}
          fx={fx}
          onClose={() => setMobileFixedType(null)}
        />
      )}
    </div>
  );
}
