import { useState, useMemo, useEffect } from "react";
import type { EntryRow, MonthlyDataset } from "./types";

interface Props {
  data: MonthlyDataset;
  monthKey: string;
  localEntries: EntryRow[];
  editable: boolean;
  onCellClick: (date: string, categoryId: string) => void;
  onOpenCatManager: () => void;
  onMonthChange: (monthKey: string) => void;
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

function toDateStr(mk: string, day: number): string {
  return `${mk}-${String(day).padStart(2, "0")}`;
}

function addMonths(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y!, m! - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
  onMonthChange,
}: Props) {
  const initialDate = useMemo(() => {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    if (todayKey === monthKey) return toDateStr(monthKey, today.getDate());
    return toDateStr(monthKey, 1);
  }, [monthKey]);

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [calOpen, setCalOpen] = useState(false);
  // カレンダー内で表示中の月（monthKey と独立して前後に動かせる）
  const [calViewMonth, setCalViewMonth] = useState(monthKey);

  // 親の monthKey が変わったら表示日・カレンダー月もリセット
  useEffect(() => {
    setSelectedDate(initialDate);
    setCalViewMonth(monthKey);
  }, [monthKey, initialDate]);

  // カレンダーを開く時は今の monthKey から表示する
  function openCalendar() {
    setCalViewMonth(monthKey);
    setCalOpen(true);
  }

  const totalDays = daysInMonth(monthKey);
  const cellMap = useMemo(() => buildCellMap(localEntries), [localEntries]);

  const columns = data.categories.filter(
    (c) => c.is_active === 1 && (c.kind === "expense" || c.kind === "both"),
  );

  const selectedDay = parseInt(selectedDate.split("-")[2]!, 10);

  // 前日：月初の場合は前月末日
  const prevMonthKey = addMonths(monthKey, -1);
  const prevMonthLastDay = daysInMonth(prevMonthKey);
  const hasPrev = true; // 常にナビ可能
  const prevDate = selectedDay > 1
    ? toDateStr(monthKey, selectedDay - 1)
    : toDateStr(prevMonthKey, prevMonthLastDay);
  const prevLabel = selectedDay > 1
    ? `${parseInt(monthKey.split("-")[1]!)}/${selectedDay - 1}`
    : `${parseInt(prevMonthKey.split("-")[1]!)}/${prevMonthLastDay}`;

  // 翌日：月末の場合は翌月1日
  const nextMonthKey = addMonths(monthKey, 1);
  const hasNext = true; // 常にナビ可能
  const nextDate = selectedDay < totalDays
    ? toDateStr(monthKey, selectedDay + 1)
    : toDateStr(nextMonthKey, 1);
  const nextLabel = selectedDay < totalDays
    ? `${parseInt(monthKey.split("-")[1]!)}/${selectedDay + 1}`
    : `${parseInt(nextMonthKey.split("-")[1]!)}/1`;

  function dayLabel(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00");
    const mo = d.getMonth() + 1;
    const dy = d.getDate();
    const wd = WEEK_DAYS[d.getDay()]!;
    return `${mo}/${dy}(${wd})`;
  }

  // カレンダー表示月のグリッド
  const calCells = useMemo(() => {
    const [y, mo] = calViewMonth.split("-").map(Number);
    const days = daysInMonth(calViewMonth);
    const firstDow = new Date(y!, mo! - 1, 1).getDay();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calViewMonth]);

  // 今日の日付文字列
  const todayStr = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }, []);

  // カレンダー表示月ラベル
  const [calY, calM] = calViewMonth.split("-").map(Number);
  const calTitle = `${calY}年${calM}月`;

  function handleCalDateSelect(day: number) {
    const newDate = toDateStr(calViewMonth, day);
    if (calViewMonth !== monthKey) {
      // 別月 → 親の monthKey を切り替え、selectedDate は新しい月の初日として渡す
      onMonthChange(calViewMonth);
      setSelectedDate(newDate);
    } else {
      setSelectedDate(newDate);
    }
    setCalOpen(false);
  }

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
            onClick={() => {
              if (selectedDay === 1) onMonthChange(prevMonthKey);
              setSelectedDate(prevDate);
            }}
            disabled={!hasPrev}
          >
            ◀ {prevLabel}
          </button>

          <div className="mobile-nav-center">
            <button
              className="mobile-nav-current"
              onClick={openCalendar}
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
                  {/* 月ナビゲーションヘッダー */}
                  <div className="mobile-cal-month-nav">
                    <button
                      className="mobile-cal-month-btn"
                      onClick={() => setCalViewMonth(addMonths(calViewMonth, -1))}
                    >
                      ◀
                    </button>
                    <span className="mobile-cal-month-label">{calTitle}</span>
                    <button
                      className="mobile-cal-month-btn"
                      onClick={() => setCalViewMonth(addMonths(calViewMonth, 1))}
                    >
                      ▶
                    </button>
                  </div>

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
                      const dateStr = toDateStr(calViewMonth, day);
                      const hasData = cellMap.has(dateStr);
                      const isSelected = dateStr === selectedDate;
                      const isToday = dateStr === todayStr;
                      return (
                        <button
                          key={i}
                          className={[
                            "mobile-cal-cell",
                            isSelected ? "mobile-cal-selected" : "",
                            isToday && !isSelected ? "mobile-cal-today" : "",
                            hasData ? "mobile-cal-has-data" : "",
                          ].filter(Boolean).join(" ")}
                          onClick={() => handleCalDateSelect(day)}
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
            onClick={() => {
              if (selectedDay === totalDays) onMonthChange(nextMonthKey);
              setSelectedDate(nextDate);
            }}
            disabled={!hasNext}
          >
            {nextLabel} ▶
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
