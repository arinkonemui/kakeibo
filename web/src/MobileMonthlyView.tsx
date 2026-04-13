import { useState, useMemo } from "react";
import type { EntryRow, MonthlyDataset } from "./types";

interface Props {
  data: MonthlyDataset;
  monthKey: string;
  localEntries: EntryRow[];
  editable: boolean;
  onCellClick: (date: string, categoryId: string) => void;
  onOpenCatManager: () => void;
}

function buildCellMap(entries: EntryRow[]): Map<string, Map<string, number>> {
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

function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y!, m!, 0).getDate();
}

function toDateStr(monthKey: string, day: number): string {
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

function fmt(n: number): string {
  return n.toLocaleString("ja-JP");
}

const WEEK_DAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function MobileMonthlyView({
  data,
  monthKey,
  localEntries,
  editable,
  onCellClick,
  onOpenCatManager,
}: Props) {
  const initialDate = useMemo(() => {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    if (todayKey === monthKey) return toDateStr(monthKey, today.getDate());
    return toDateStr(monthKey, 1);
  }, [monthKey]);

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [calOpen, setCalOpen] = useState(false);

  const totalDays = daysInMonth(monthKey);
  const cellMap = useMemo(() => buildCellMap(localEntries), [localEntries]);

  const columns = data.categories.filter(
    (c) => c.is_active === 1 && (c.kind === "expense" || c.kind === "both"),
  );

  const selectedDay = parseInt(selectedDate.split("-")[2]!, 10);
  const monthNum = parseInt(monthKey.split("-")[1]!, 10);

  const prevDay = selectedDay > 1 ? selectedDay - 1 : null;
  const nextDay = selectedDay < totalDays ? selectedDay + 1 : null;
  const prevDate = prevDay != null ? toDateStr(monthKey, prevDay) : null;
  const nextDate = nextDay != null ? toDateStr(monthKey, nextDay) : null;

  function dayLabel(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00");
    const mo = d.getMonth() + 1;
    const dy = d.getDate();
    const wd = WEEK_DAYS[d.getDay()]!;
    return `${mo}/${dy}(${wd})`;
  }

  // Calendar grid rendering
  const calCells = useMemo(() => {
    const [y, mo] = monthKey.split("-").map(Number);
    const firstDow = new Date(y!, mo! - 1, 1).getDay();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= totalDays; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthKey, totalDays]);

  const dayCells = cellMap.get(selectedDate);
  const dayTotal = columns.reduce(
    (s, c) => s + (dayCells?.get(c.category_id) ?? 0),
    0,
  );

  return (
    <div className="mobile-day-view">
      {/* Toolbar: カテゴリ管理 + 日付ナビ */}
      <div className="mobile-day-toolbar">
        <button className="btn-open-cat" onClick={onOpenCatManager}>
          カテゴリ管理
        </button>

        <div className="mobile-day-nav">
          <button
            className="mobile-nav-btn"
            onClick={() => prevDate && setSelectedDate(prevDate)}
            disabled={!prevDate}
          >
            ◀ {prevDay != null ? `${monthNum}/${prevDay}` : ""}
          </button>

          <div className="mobile-nav-center">
            <button
              className="mobile-nav-current"
              onClick={() => setCalOpen((v) => !v)}
            >
              {dayLabel(selectedDate)}
            </button>

            {calOpen && (
              <>
                <div
                  className="mobile-cal-backdrop"
                  onClick={() => setCalOpen(false)}
                />
                <div
                  className="mobile-calendar-popup"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mobile-calendar-weekdays">
                    {WEEK_DAYS.map((w, i) => (
                      <span key={i} className="mobile-cal-wd">{w}</span>
                    ))}
                  </div>
                  <div className="mobile-calendar-grid">
                    {calCells.map((day, i) => {
                      if (day === null) {
                        return <span key={i} className="mobile-cal-cell mobile-cal-empty" />;
                      }
                      const dateStr = toDateStr(monthKey, day);
                      const hasData = cellMap.has(dateStr);
                      const isSelected = day === selectedDay;
                      return (
                        <button
                          key={i}
                          className={[
                            "mobile-cal-cell",
                            isSelected ? "mobile-cal-selected" : "",
                            hasData ? "mobile-cal-has-data" : "",
                          ].filter(Boolean).join(" ")}
                          onClick={() => {
                            setSelectedDate(dateStr);
                            setCalOpen(false);
                          }}
                        >
                          {day}
                          {hasData && <span className="mobile-cal-dot" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            className="mobile-nav-btn"
            onClick={() => nextDate && setSelectedDate(nextDate)}
            disabled={!nextDate}
          >
            {nextDay != null ? `${monthNum}/${nextDay}` : ""} ▶
          </button>
        </div>
      </div>

      {/* Category × Amount table */}
      <table className="mobile-cat-table">
        <tbody>
          {columns.length === 0 && (
            <tr>
              <td colSpan={2} className="mobile-cat-empty">
                カテゴリなし
              </td>
            </tr>
          )}
          {columns.map((cat) => {
            const val = dayCells?.get(cat.category_id) ?? 0;
            return (
              <tr
                key={cat.category_id}
                className={`mobile-cat-row${editable ? " mobile-cat-row--editable" : ""}`}
                onClick={() => editable && onCellClick(selectedDate, cat.category_id)}
              >
                <td className="mobile-cat-name">{cat.name}</td>
                <td className="mobile-cat-amount">
                  {val > 0 ? `¥${fmt(val)}` : ""}
                </td>
              </tr>
            );
          })}
          {columns.length > 0 && (
            <tr className="mobile-cat-total-row">
              <td className="mobile-cat-name">合計</td>
              <td className="mobile-cat-amount">
                {dayTotal > 0 ? <strong>¥{fmt(dayTotal)}</strong> : ""}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
