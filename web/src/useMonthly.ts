import { useCallback, useEffect, useState } from "react";
import { fetchMonthlyDataset, getDevUserId } from "./api";
import type { MonthlyDataset } from "./types";

interface UseMonthlyResult {
  data: MonthlyDataset | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMonthly(monthKey: string): UseMonthlyResult {
  const [data, setData] = useState<MonthlyDataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    if (!monthKey || !getDevUserId()) {
      setData(null);
      setError(monthKey ? "Dev user_id が未設定です" : null);
      return;
    }
    setLoading(true);
    setError(null);
    fetchMonthlyDataset(monthKey)
      .then(setData)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [monthKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
