import type { CategoryRow, EntryRow, MonthlyDataset } from "./types";

interface Props {
  data: MonthlyDataset;
  monthKey: string;
  /** Merged entries: server entries + local creates - local deletes */
  localEntries: EntryRow[];
  editable: boolean;
  onCellClick?: (date: string, categoryId: string) => void;
}

/** Get number of days in a month from YYYY-MM key */
function daysInMonth(monthKey: string): number {
  const [yearStr, monStr] = monthKey.split("-");
  const year = Number(yearStr);
  const mon = Number(monStr);
  return new Date(year, mon, 0).getDate();
}

/** Format number with comma separator */
function fmt(n: number): string {
  return n.toLocaleString("ja-JP");
}

/**
 * Build a lookup: { "YYYY-MM-DD": { category_id: total_expense } }
 * Only expense entries are counted (SPEC §3.1: 月間表は支出のみ表示).
 */
function buildCellMap(
  entries: EntryRow[],
): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const e of entries) {
    if (e.type !== "expense") continue;
    let dayMap = map.get(e.date);
    if (!dayMap) {
      dayMap = new Map();
      map.set(e.date, dayMap);
    }
    dayMap.set(e.category_id, (dayMap.get(e.category_id) ?? 0) + e.amount);
  }
  return map;
}

export function MonthlyTable({ data, monthKey, localEntries, editable, onCellClick }: Props) {
  // Active expense categories only (for table columns)
  const columns: CategoryRow[] = data.categories.filter(
    (c) => c.is_active === 1 && (c.kind === "expense" || c.kind === "both"),
  );

  const days = daysInMonth(monthKey);
  const cellMap = buildCellMap(localEntries);

  // Category totals (bottom row)
  const categoryTotals = new Map<string, number>();
  // Grand total
  let grandTotal = 0;

  // Build rows
  const rows: {
    day: number;
    dateStr: string;
    dayTotal: number;
    cells: Map<string, number>;
  }[] = [];

  for (let d = 1; d <= days; d++) {
    const dateStr = `${monthKey}-${String(d).padStart(2, "0")}`;
    const dayCells = cellMap.get(dateStr);
    let dayTotal = 0;

    const cells = new Map<string, number>();
    for (const col of columns) {
      const val = dayCells?.get(col.category_id) ?? 0;
      cells.set(col.category_id, val);
      dayTotal += val;
      categoryTotals.set(
        col.category_id,
        (categoryTotals.get(col.category_id) ?? 0) + val,
      );
    }
    grandTotal += dayTotal;
    rows.push({ day: d, dateStr, dayTotal, cells });
  }

  // Weekday labels
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  // Budget info
  const monthlyBudget = data.month?.monthly_budget ?? null;
  const remaining =
    monthlyBudget != null ? monthlyBudget - grandTotal : null;

  return (
    <div className="monthly-table-wrapper">
      {/* Summary header */}
      <div className="month-summary">
        <span className="summary-item">
          月支出合計: <strong>¥{fmt(grandTotal)}</strong>
        </span>
        {monthlyBudget != null && (
          <>
            <span className="summary-item">
              月予算: ¥{fmt(monthlyBudget)}
            </span>
            <span
              className="summary-item"
              style={{ color: remaining! < 0 ? "#e74c3c" : "#27ae60" }}
            >
              月残: ¥{fmt(remaining!)}
            </span>
          </>
        )}
      </div>

      <div className="table-scroll">
        <table className="monthly-table">
          <thead>
            <tr>
              <th className="col-day sticky-left">日</th>
              <th className="col-dow sticky-left-2">曜</th>
              {columns.map((c) => (
                <th key={c.category_id} className="col-cat">
                  {c.name}
                </th>
              ))}
              <th className="col-total sticky-right">日合算</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const dow = new Date(row.dateStr).getDay();
              const isWeekend = dow === 0 || dow === 6;
              return (
                <tr
                  key={row.day}
                  className={isWeekend ? "row-weekend" : undefined}
                >
                  <td className="col-day sticky-left">{row.day}</td>
                  <td
                    className="col-dow sticky-left-2"
                    style={{
                      color:
                        dow === 0
                          ? "#e74c3c"
                          : dow === 6
                            ? "#3498db"
                            : undefined,
                    }}
                  >
                    {weekdays[dow]}
                  </td>
                  {columns.map((c) => {
                    const val = row.cells.get(c.category_id) ?? 0;
                    const clickable = editable && onCellClick;
                    return (
                      <td
                        key={c.category_id}
                        className={`col-cat cell-amount${clickable ? " cell-clickable" : ""}`}
                        onClick={
                          clickable
                            ? () => onCellClick(row.dateStr, c.category_id)
                            : undefined
                        }
                      >
                        {val > 0 ? fmt(val) : ""}
                      </td>
                    );
                  })}
                  <td className="col-total sticky-right cell-amount">
                    {row.dayTotal > 0 ? (
                      <strong>{fmt(row.dayTotal)}</strong>
                    ) : (
                      ""
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="row-totals">
              <td className="sticky-left" colSpan={2}>
                <strong>合計</strong>
              </td>
              {columns.map((c) => {
                const total = categoryTotals.get(c.category_id) ?? 0;
                return (
                  <td key={c.category_id} className="col-cat cell-amount">
                    <strong>{total > 0 ? fmt(total) : ""}</strong>
                  </td>
                );
              })}
              <td className="col-total sticky-right cell-amount">
                <strong>{fmt(grandTotal)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {localEntries.length === 0 && (
        <p className="empty-message">この月のデータはまだありません。</p>
      )}
    </div>
  );
}
