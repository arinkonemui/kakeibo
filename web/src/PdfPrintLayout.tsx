/**
 * A4 固定2枚 PDF 印刷レイアウト。
 * document.body にポータルとして描画し、@media print でのみ表示される。
 * window.print() を呼ぶと印刷ダイアログが開き、「PDFとして保存」で保存できる。
 *
 * 1枚目: 月間マトリクス（日 × カテゴリ + 支出 + 収入 + 合計）
 * 2枚目: グラフ（円グラフ・折れ線グラフ）＋ 月合算値
 */

import { useMemo } from "react";
import { createPortal } from "react-dom";
import {
  CATEGORY_COLORS,
  computeCategoryTotals,
  computeDailyTotals,
  computeMonthlySummary,
  daysInMonth,
  fmt,
} from "./aggregateUtils";
import { LineChart } from "./charts/LineChart";
import { PieChart } from "./charts/PieChart";
import type { EntryRow, MonthlyDataset } from "./types";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 支出: 日 × カテゴリ の合計マップを構築（MonthlyTable と同一ロジック） */
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

/** 収入: 日ごとの合計マップを構築 */
function buildIncomeMap(entries: EntryRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (e.type !== "income") continue;
    map.set(e.date, (map.get(e.date) ?? 0) + e.amount);
  }
  return map;
}

interface Props {
  monthKey: string;
  data: MonthlyDataset;
  /** ops 適用済みエントリ（保存前の最新状態） */
  localEntries: EntryRow[];
}

export function PdfPrintLayout({ monthKey, data, localEntries }: Props) {
  // アクティブな支出カテゴリ（MonthlyTable と同一フィルタ）
  const columns = useMemo(
    () =>
      data.categories.filter(
        (c) => c.is_active === 1 && (c.kind === "expense" || c.kind === "both"),
      ),
    [data.categories],
  );

  // 1枚目用: 日×カテゴリ マトリクス行データ
  const matrixRows = useMemo(() => {
    const days = daysInMonth(monthKey);
    const cellMap = buildCellMap(localEntries);
    const incomeMap = buildIncomeMap(localEntries);

    return Array.from({ length: days }, (_, i) => {
      const day = i + 1;
      const dateStr = `${monthKey}-${String(day).padStart(2, "0")}`;
      const dayCells = cellMap.get(dateStr);
      const cells = new Map(
        columns.map((c) => [
          c.category_id,
          dayCells?.get(c.category_id) ?? 0,
        ]),
      );
      const expense = [...cells.values()].reduce((a, b) => a + b, 0);
      const income = incomeMap.get(dateStr) ?? 0;
      return { day, dateStr, cells, expense, income };
    });
  }, [localEntries, monthKey, columns]);

  // カテゴリ別月合計（合計行用）
  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of matrixRows) {
      for (const [catId, val] of row.cells) {
        totals.set(catId, (totals.get(catId) ?? 0) + val);
      }
    }
    return totals;
  }, [matrixRows]);

  // 2枚目用
  const { items: categoryItems, grandTotal } = useMemo(
    () => computeCategoryTotals(localEntries, data.categories),
    [localEntries, data.categories],
  );

  const dailyTotals = useMemo(
    () => computeDailyTotals(localEntries, monthKey),
    [localEntries, monthKey],
  );

  const summary = useMemo(
    () => computeMonthlySummary(localEntries, data.month),
    [localEntries, data.month],
  );

  const defaultDayBudget = useMemo(() => {
    if (summary.monthlyBudget == null) return null;
    return Math.floor(summary.monthlyBudget / daysInMonth(monthKey));
  }, [summary.monthlyBudget, monthKey]);

  const pieSlices = useMemo(
    () =>
      categoryItems.map((c, i) => ({
        label: c.name,
        value: c.total,
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]!,
      })),
    [categoryItems],
  );

  const linePoints = useMemo(
    () => dailyTotals.map((d) => ({ label: String(d.day), value: d.expense })),
    [dailyTotals],
  );

  const [year, month] = monthKey.split("-");
  const monthLabel = `${year}年${month}月`;

  const content = (
    <div className="pdf-root">
      {/* ===== 1枚目: 月間マトリクス ===== */}
      <div className="pdf-page">
        <header className="pdf-header">
          <span className="pdf-app-name">おさいふノート</span>
          <span className="pdf-header-title">{monthLabel} 家計簿</span>
        </header>

        <table className="pdf-matrix-table">
          <thead>
            <tr>
              <th className="pdf-col-day">日</th>
              <th className="pdf-col-dow">曜</th>
              {columns.map((c) => (
                <th key={c.category_id} className="pdf-col-cat">
                  {c.name}
                </th>
              ))}
              <th className="pdf-col-summary">支出</th>
              <th className="pdf-col-summary">収入</th>
              <th className="pdf-col-summary">合計</th>
            </tr>
          </thead>
          <tbody>
            {matrixRows.map((row) => {
              const dow = new Date(row.dateStr).getDay();
              const isWeekend = dow === 0 || dow === 6;
              const net = row.income - row.expense;
              return (
                <tr
                  key={row.day}
                  className={isWeekend ? "pdf-row-weekend" : undefined}
                >
                  <td className="pdf-col-day">{row.day}</td>
                  <td
                    className="pdf-col-dow"
                    style={{
                      color:
                        dow === 0
                          ? "#e74c3c"
                          : dow === 6
                            ? "#3498db"
                            : undefined,
                    }}
                  >
                    {WEEKDAYS[dow]}
                  </td>
                  {columns.map((c) => {
                    const val = row.cells.get(c.category_id) ?? 0;
                    return (
                      <td key={c.category_id} className="pdf-num pdf-col-cat">
                        {val > 0 ? `¥${fmt(val)}` : ""}
                      </td>
                    );
                  })}
                  <td className="pdf-num pdf-col-summary">
                    {row.expense > 0 ? `¥${fmt(row.expense)}` : ""}
                  </td>
                  <td className="pdf-num pdf-col-summary">
                    {row.income > 0 ? `¥${fmt(row.income)}` : ""}
                  </td>
                  <td
                    className="pdf-num pdf-col-summary"
                    style={
                      net !== 0
                        ? { color: net < 0 ? "#e74c3c" : "#27ae60" }
                        : undefined
                    }
                  >
                    {net !== 0 ? `¥${fmt(net)}` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="pdf-tfoot-row">
              <td colSpan={2} className="pdf-tfoot-label">
                合計
              </td>
              {columns.map((c) => {
                const total = categoryTotals.get(c.category_id) ?? 0;
                return (
                  <td key={c.category_id} className="pdf-num pdf-col-cat">
                    {total > 0 ? `¥${fmt(total)}` : ""}
                  </td>
                );
              })}
              <td className="pdf-num pdf-col-summary">
                ¥{fmt(summary.totalExpense)}
              </td>
              <td className="pdf-num pdf-col-summary">
                ¥{fmt(summary.totalIncome)}
              </td>
              <td
                className="pdf-num pdf-col-summary"
                style={{
                  color: summary.netBalance < 0 ? "#e74c3c" : "#27ae60",
                }}
              >
                ¥{fmt(summary.netBalance)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ===== 2枚目: グラフ＋合算値 ===== */}
      <div className="pdf-page pdf-page-last">
        <header className="pdf-header">
          <span className="pdf-app-name">おさいふノート</span>
          <span className="pdf-header-title">{monthLabel} 集計</span>
        </header>

        {/* サマリー */}
        <section className="pdf-summary">
          <div className="pdf-summary-item">
            <span className="pdf-summary-label">支出合計</span>
            <span className="pdf-summary-value">¥{fmt(summary.totalExpense)}</span>
          </div>
          <div className="pdf-summary-item">
            <span className="pdf-summary-label">収入合計</span>
            <span className="pdf-summary-value">¥{fmt(summary.totalIncome)}</span>
          </div>
          <div className="pdf-summary-item">
            <span className="pdf-summary-label">収支差額</span>
            <span
              className="pdf-summary-value"
              style={{ color: summary.netBalance < 0 ? "#e74c3c" : "#27ae60" }}
            >
              ¥{fmt(summary.netBalance)}
            </span>
          </div>
          {summary.monthlyBudget != null && (
            <div className="pdf-summary-item">
              <span className="pdf-summary-label">予算残</span>
              <span
                className="pdf-summary-value"
                style={{
                  color: summary.budgetRemaining! < 0 ? "#e74c3c" : "#27ae60",
                }}
              >
                ¥{fmt(summary.budgetRemaining!)}
              </span>
            </div>
          )}
          <div className="pdf-summary-item">
            <span className="pdf-summary-label">支出件数</span>
            <span className="pdf-summary-value">{summary.expenseCount}件</span>
          </div>
          {summary.incomeCount > 0 && (
            <div className="pdf-summary-item">
              <span className="pdf-summary-label">収入件数</span>
              <span className="pdf-summary-value">{summary.incomeCount}件</span>
            </div>
          )}
        </section>

        {/* カテゴリ別支出 */}
        <section className="pdf-section">
          <h3 className="pdf-section-title">カテゴリ別支出</h3>
          <div className="pdf-category-row">
            <div className="pdf-pie-wrapper">
              <PieChart slices={pieSlices} size={160} />
            </div>
            <table className="pdf-cat-table">
              <thead>
                <tr>
                  <th>カテゴリ</th>
                  <th className="pdf-num">金額</th>
                  <th className="pdf-num">割合</th>
                </tr>
              </thead>
              <tbody>
                {categoryItems.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="pdf-empty">
                      支出データなし
                    </td>
                  </tr>
                ) : (
                  categoryItems.map((c, i) => (
                    <tr key={c.categoryId}>
                      <td>
                        <span
                          className="pdf-color-dot"
                          style={{
                            background:
                              CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                          }}
                        />
                        {c.name}
                      </td>
                      <td className="pdf-num">¥{fmt(c.total)}</td>
                      <td className="pdf-num">{c.percentage.toFixed(1)}%</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="pdf-tfoot-row">
                  <td>合計</td>
                  <td className="pdf-num">¥{fmt(grandTotal)}</td>
                  <td className="pdf-num">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* 日別支出推移 */}
        <section className="pdf-section">
          <h3 className="pdf-section-title">日別支出推移</h3>
          <div className="pdf-line-wrapper">
            <LineChart
              points={linePoints}
              budgetLine={defaultDayBudget}
              width={540}
              height={170}
            />
          </div>
        </section>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
