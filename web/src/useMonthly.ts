import { useCallback, useEffect, useState } from "react";
import { fetchMonthlyDataset, getDevUserId } from "./api";
import type { MonthlyDataset } from "./types";

function isLocalDev(): boolean {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

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
    // In local dev mode (without auth token), require DevUserBar to be set
    const hasToken = !!localStorage.getItem("osaifu_token");
    if (!monthKey || (isLocalDev() && !hasToken && !getDevUserId())) {
      setData(null);
      setError(monthKey && isLocalDev() && !hasToken ? "Dev user_id が未設定です" : null);
      return;
    }
    setLoading(true);
    setData(null); // clear stale data so consumers always see current-month data
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
