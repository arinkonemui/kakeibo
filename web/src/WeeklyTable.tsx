import type { CategoryRow, EntryRow, MonthlyDataset } from "./types";

interface Props {
  data: MonthlyDataset;
  monthKey: string;
  localEntries: EntryRow[];
  /** Merged daily budget overrides: server + local ops */
  localDailyBudgets: Map<string, number>;
  editable: boolean;
  onCellClick?: (date: string, categoryId: string) => void;
}

/** Get number of days in a month from YYYY-MM key */
function daysInMonth(monthKey: string): number {
  const [yearStr, monStr] = monthKey.split("-");
  return new Date(Number(yearStr), Number(monStr), 0).getDate();
}

/** Format number with comma separator */
function fmt(n: number): string {
  return n.toLocaleString("ja-JP");
}

/** Build cell map: date → category_id → total expense */
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

interface DayRow {
  day: number;
  dateStr: string;
  dow: number; // 0=Sun ... 6=Sat
}

interface Week {
  weekNum: number;
  label: string; // e.g. "第1週 (2/1〜2/2)"
  days: DayRow[];
}

/** Split month days into weeks starting on Monday (SPEC §5) */
function splitIntoWeeks(monthKey: string): Week[] {
  const days = daysInMonth(monthKey);
  const weeks: Week[] = [];
  let currentWeek: DayRow[] = [];
  let weekNum = 1;

  for (let d = 1; d <= days; d++) {
    const dateStr = `${monthKey}-${String(d).padStart(2, "0")}`;
    const dow = new Date(dateStr).getDay();
    const dayRow: DayRow = { day: d, dateStr, dow };

    // Start a new week on Monday (dow=1), but not on the very first day
    if (dow === 1 && currentWeek.length > 0) {
      weeks.push(buildWeek(weekNum, currentWeek, monthKey));
      weekNum++;
      currentWeek = [];
    }
    currentWeek.push(dayRow);
  }

  // Push the last week
  if (currentWeek.length > 0) {
    weeks.push(buildWeek(weekNum, currentWeek, monthKey));
  }

  return weeks;
}

function buildWeek(weekNum: number, days: DayRow[], monthKey: string): Week {
  const mon = Number(monthKey.split("-")[1]);
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const label =
    first.day === last.day
      ? `第${weekNum}週 (${mon}/${first.day})`
      : `第${weekNum}週 (${mon}/${first.day}〜${mon}/${last.day})`;
  return { weekNum, label, days };
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export function WeeklyTable({
  data,
  monthKey,
  localEntries,
  localDailyBudgets,
  editable,
  onCellClick,
}: Props) {
  const columns: CategoryRow[] = data.categories.filter(
    (c) => c.is_active === 1 && (c.kind === "expense" || c.kind === "both"),
  );

  const cellMap = buildCellMap(localEntries);
  const weeks = splitIntoWeeks(monthKey);

  // Grand total for the month
  let grandTotal = 0;
  for (const [, dayMap] of cellMap) {
    for (const [, val] of dayMap) {
      grandTotal += val;
    }
  }

  // Budget info
  const monthlyBudget = data.month?.monthly_budget ?? null;
  const remaining =
    monthlyBudget != null ? monthlyBudget - grandTotal : null;
  const days = daysInMonth(monthKey);
  const defaultDayBudget =
    monthlyBudget != null ? Math.floor(monthlyBudget / days) : null;

  return (
    <div className="weekly-view">
      {/* Summary header (same as MonthlyTable) */}
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

      {weeks.map((week) => {
        // Compute per-week category totals and week total
        const weekCategoryTotals = new Map<string, number>();
        let weekTotal = 0;

        const rowsData = week.days.map((dayRow) => {
          const dayCells = cellMap.get(dayRow.dateStr);
          let dayTotal = 0;
          const cells = new Map<string, number>();
          for (const col of columns) {
            const val = dayCells?.get(col.category_id) ?? 0;
            cells.set(col.category_id, val);
            dayTotal += val;
            weekCategoryTotals.set(
              col.category_id,
              (weekCategoryTotals.get(col.category_id) ?? 0) + val,
            );
          }
          weekTotal += dayTotal;
          return { ...dayRow, cells, dayTotal };
        });

        return (
          <div key={week.weekNum} className="week-section">
            <h4 className="week-label">{week.label}</h4>
            <div className="table-scroll">
              <table className="monthly-table weekly-table">
                <thead>
                  <tr>
                    <th className="col-day sticky-left">日</th>
                    <th className="col-dow sticky-left-2">曜</th>
                    {columns.map((c) => (
                      <th key={c.category_id} className="col-cat">
                        {c.name}
                      </th>
                    ))}
                    <th className="col-total sticky-right">
                      {defaultDayBudget != null
                        ? `一日合計(¥${fmt(defaultDayBudget)}/日)`
                        : "一日合計"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rowsData.map((row) => {
                    const isWeekend = row.dow === 0 || row.dow === 6;
                    const dayBudget =
                      localDailyBudgets.get(row.dateStr) ?? defaultDayBudget;
                    const overBudget =
                      dayBudget != null && row.dayTotal > dayBudget;
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
                              row.dow === 0
                                ? "#e74c3c"
                                : row.dow === 6
                                  ? "#3498db"
                                  : undefined,
                          }}
                        >
                          {WEEKDAY_LABELS[row.dow]}
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
                                  ? () =>
                                      onCellClick(row.dateStr, c.category_id)
                                  : undefined
                              }
                            >
                              {val > 0 ? `¥${fmt(val)}` : ""}
                            </td>
                          );
                        })}
                        <td
                          className={`col-total sticky-right cell-amount${overBudget ? " cell-over-budget" : ""}`}
                        >
                          {row.dayTotal > 0 ? (
                            <>
                              <strong>¥{fmt(row.dayTotal)}</strong>
                              {localDailyBudgets.has(row.dateStr) && (
                                <span className="budget-override-mark">日予</span>
                              )}
                            </>
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
                      <strong>週計</strong>
                    </td>
                    {columns.map((c) => {
                      const total =
                        weekCategoryTotals.get(c.category_id) ?? 0;
                      return (
                        <td
                          key={c.category_id}
                          className="col-cat cell-amount"
                        >
                          <strong>
                            {total > 0 ? `¥${fmt(total)}` : ""}
                          </strong>
                        </td>
                      );
                    })}
                    <td className="col-total sticky-right cell-amount">
                      <strong>¥{fmt(weekTotal)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}

      {localEntries.length === 0 && (
        <p className="empty-message">この月のデータはまだありません。</p>
      )}
    </div>
  );
}
