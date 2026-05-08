/**
 * useFixedExpenses — 固定費・収入の状態管理 shared hook
 * monthKey が変わると自動的に再フェッチする。
 * App から月間・週間タブに渡すことで両タブで共有。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyFixedExpensesToFuture,
  createFixedExpense,
  deleteFixedExpense,
  fetchFixedExpenses,
  updateFixedExpense,
} from "./api";
import type { FixedExpenseRow } from "./types";

export interface UseFixedExpensesReturn {
  items: FixedExpenseRow[];
  expenseItems: FixedExpenseRow[];
  incomeItems: FixedExpenseRow[];
  loading: boolean;
  error: string | null;
  /** id → 入力中の金額文字列 */
  draftAmounts: Record<string, string>;
  setDraftAmounts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  /** ドラフトが保存済みと異なるか */
  isDirty: boolean;
  saving: boolean;
  savedMsg: boolean;
  /** 変更のあるアイテムのみ PATCH して再ロード */
  handleSaveAll: () => Promise<void>;
  /** ドラフトを保存済み金額に戻す */
  resetDrafts: () => void;
  /** 固定費/収入を追加 */
  handleAdd: (name: string, iconKey: string, amount: number, entryType?: string) => Promise<string | null>;
  /** 固定費/収入を削除 */
  handleDelete: (item: FixedExpenseRow) => Promise<string | null>;
  /** 名前・アイコンを更新 */
  handleUpdateMeta: (id: string, patch: { name?: string; icon_key?: string }) => Promise<string | null>;
  /** 手動再フェッチ */
  reload: () => Promise<void>;
  /** 当月の固定費・収入（または指定 entry_type のみ）を未来月すべてに一括反映 */
  applyToFuture: (entryType?: "expense" | "income") => Promise<{ ok: true; applied_months: number } | { error: string }>;
  applyingToFuture: boolean;
}

export function useFixedExpenses(monthKey: string): UseFixedExpensesReturn {
  const [items, setItems] = useState<FixedExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [applyingToFuture, setApplyingToFuture] = useState(false);
  const savedMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const expenseItems = useMemo(() => items.filter((i) => i.entry_type !== "income"), [items]);
  const incomeItems = useMemo(() => items.filter((i) => i.entry_type === "income"), [items]);

  const isDirty = useMemo(() => items.some((item) => {
    const draft = draftAmounts[item.fixed_expense_id] ?? "";
    const parsed = draft === "" ? 0 : parseInt(draft, 10);
    return !isNaN(parsed) && parsed !== item.amount;
  }), [items, draftAmounts]);

  const applyItems = useCallback((data: FixedExpenseRow[]) => {
    setItems(data);
    const drafts: Record<string, string> = {};
    for (const item of data) {
      drafts[item.fixed_expense_id] = item.amount === 0 ? "" : String(item.amount);
    }
    setDraftAmounts(drafts);
  }, []);

  const resetDrafts = useCallback(() => {
    const drafts: Record<string, string> = {};
    for (const item of items) {
      drafts[item.fixed_expense_id] = item.amount === 0 ? "" : String(item.amount);
    }
    setDraftAmounts(drafts);
  }, [items]);

  const reload = useCallback(async () => {
    const data = await fetchFixedExpenses(monthKey);
    applyItems(data);
  }, [monthKey, applyItems]);

  // monthKey 変更時に再フェッチ
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchFixedExpenses(monthKey)
      .then((data) => {
        if (cancelled) return;
        applyItems(data);
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
  }, [monthKey, applyItems]);

  // savedMsg 自動クリア
  useEffect(() => {
    if (!savedMsg) return;
    if (savedMsgTimerRef.current) clearTimeout(savedMsgTimerRef.current);
    savedMsgTimerRef.current = setTimeout(() => setSavedMsg(false), 2000);
    return () => {
      if (savedMsgTimerRef.current) clearTimeout(savedMsgTimerRef.current);
    };
  }, [savedMsg]);

  const handleSaveAll = useCallback(async () => {
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
  }, [items, draftAmounts, reload]);

  const handleAdd = useCallback(
    async (name: string, iconKey: string, amount: number, entryType = "expense"): Promise<string | null> => {
      const res = await createFixedExpense(monthKey, name, iconKey, amount, entryType);
      if ("error" in res) return res.error;
      const newItem = res.item;
      setItems((prev) => [...prev, newItem]);
      setDraftAmounts((prev) => ({
        ...prev,
        [newItem.fixed_expense_id]:
          newItem.amount === 0 ? "" : String(newItem.amount),
      }));
      return null;
    },
    [monthKey],
  );

  const handleDelete = useCallback(
    async (item: FixedExpenseRow): Promise<string | null> => {
      const res = await deleteFixedExpense(item.fixed_expense_id);
      if ("error" in res) return res.error;
      setItems((prev) =>
        prev.filter((i) => i.fixed_expense_id !== item.fixed_expense_id),
      );
      setDraftAmounts((prev) => {
        const next = { ...prev };
        delete next[item.fixed_expense_id];
        return next;
      });
      return null;
    },
    [],
  );

  const applyToFuture = useCallback(async (entryType?: "expense" | "income"): Promise<{ ok: true; applied_months: number } | { error: string }> => {
    setApplyingToFuture(true);
    try {
      return await applyFixedExpensesToFuture(monthKey, entryType);
    } finally {
      setApplyingToFuture(false);
    }
  }, [monthKey]);

  const handleUpdateMeta = useCallback(
    async (
      id: string,
      patch: { name?: string; icon_key?: string },
    ): Promise<string | null> => {
      const res = await updateFixedExpense(id, patch);
      if ("error" in res) return res.error;
      setItems((prev) =>
        prev.map((i) => (i.fixed_expense_id === id ? res.item : i)),
      );
      return null;
    },
    [],
  );

  return {
    items,
    expenseItems,
    incomeItems,
    loading,
    error,
    draftAmounts,
    setDraftAmounts,
    isDirty,
    saving,
    savedMsg,
    handleSaveAll,
    resetDrafts,
    handleAdd,
    handleDelete,
    handleUpdateMeta,
    reload,
    applyToFuture,
    applyingToFuture,
  };
}
