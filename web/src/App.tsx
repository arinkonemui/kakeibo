import { useCallback, useState } from "react";
import { DevUserBar } from "./DevUserBar";
import { MonthlyTable } from "./MonthlyTable";
import { useMonthly } from "./useMonthly";

/** Get current month as YYYY-MM */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function App() {
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const [fetchKey, setFetchKey] = useState(0);
  // fetchKey forces refetch when dev user changes
  const keyForHook = `${monthKey}#${fetchKey}`;
  void keyForHook; // used indirectly

  const { data, loading, error, refetch } = useMonthly(monthKey);

  const handleDevUserChange = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  // refetch when fetchKey changes
  const _ = fetchKey; void _;
  // Actually trigger refetch via useEffect in useMonthly by changing monthKey dependency
  // But we need a better mechanism — let's use refetch directly
  const handleDevChange = useCallback(() => {
    handleDevUserChange();
    // Small delay to let localStorage update propagate
    setTimeout(refetch, 50);
  }, [handleDevUserChange, refetch]);

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
            setMonthKey(
              `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`,
            );
          }}
        >
          ◀ 前月
        </button>

        <input
          type="month"
          value={monthKey}
          onChange={(e) => setMonthKey(e.target.value)}
        />

        <button onClick={() => setMonthKey(currentMonthKey())}>今月</button>

        <button
          onClick={() => {
            const [y, m] = monthKey.split("-").map(Number);
            const next = new Date(y!, m!, 1);
            setMonthKey(
              `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`,
            );
          }}
        >
          次月 ▶
        </button>
      </div>

      {loading && <p className="status">読み込み中…</p>}
      {error && <p className="status error">エラー: {error}</p>}
      {data && <MonthlyTable data={data} monthKey={monthKey} />}
    </div>
  );
}
