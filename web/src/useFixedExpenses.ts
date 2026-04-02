/**
 * useFixedExpenses — 固定費の状態管理 shared hook
 * monthKey が変わると自動的に再フェッチする。
 * App から月間・週間タブに渡すことで両タブで共有。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createFixedExpense,
  deleteFixedExpense,
  fetchFixedExpenses,
  updateFixedExpense,
} from "./api";
import type { FixedExpenseRow } from "./types";

export interface UseFixedExpensesReturn {
  items: FixedExpenseRow[];
  loading: boolean;
  error: string | null;
  /** id → 入力中の金額文字列 */
  draftAmounts: Record<string, string>;
  setDraftAmounts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  saving: boolean;
  savedMsg: boolean;
  /** 変更のあるアイテムのみ PATCH して再ロード */
  handleSaveAll: () => Promise<void>;
  /** 固定費を追加 */
  handleAdd: (name: string, iconKey: string, amount: number) => Promise<string | null>;
  /** 固定費を削除 */
  handleDelete: (item: FixedExpenseRow) => Promise<string | null>;
  /** 固定費名・アイコンを更新 */
  handleUpdateMeta: (id: string, patch: { name?: string; icon_key?: string }) => Promise<string | null>;
  /** 手動再フェッチ */
  reload: () => Promise<void>;
}

export function useFixedExpenses(monthKey: string): UseFixedExpensesReturn {
  const [items, setItems] = useState<FixedExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  // savedMsg 自動クリア（2秒後）
  const savedMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyItems = useCallback((data: FixedExpenseRow[]) => {
    setItems(data);
    const drafts: Record<string, string> = {};
    for (const item of data) {
      drafts[item.fixed_expense_id] = item.amount === 0 ? "" : String(item.amount);
    }
    setDraftAmounts(drafts);
  }, []);

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
    async (name: string, iconKey: string, amount: number): Promise<string | null> => {
      const res = await createFixedExpense(monthKey, name, iconKey, amount);
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
    loading,
    error,
    draftAmounts,
    setDraftAmounts,
    saving,
    savedMsg,
    handleSaveAll,
    handleAdd,
    handleDelete,
    handleUpdateMeta,
    reload,
  };
}
