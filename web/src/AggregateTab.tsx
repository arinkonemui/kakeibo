import { useMemo } from "react";
import {
  computeCategoryTotals,
  computeDailyTotals,
  computeMonthlySummary,
  daysInMonth,
  fmt,
} from "./aggregateUtils";
import { LineChart } from "./charts/LineChart";
import { PieChart } from "./charts/PieChart";
import type { EntryRow, MonthlyDataset } from "./types";

interface Props {
  data: MonthlyDataset;
  monthKey: string;
  localEntries: EntryRow[];
}

export function AggregateTab({ data, monthKey, localEntries }: Props) {
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

  // Default daily budget for the line chart reference line
  const defaultDayBudget = useMemo(() => {
    if (summary.monthlyBudget == null) return null;
    return Math.floor(summary.monthlyBudget / daysInMonth(monthKey));
  }, [summary.monthlyBudget, monthKey]);

  // Pie chart slices
  const pieSlices = useMemo(
    () =>
      categoryItems.map((c) => ({
        label: c.name,
        value: c.total,
        color: c.color,
      })),
    [categoryItems],
  );

  // Line chart points
  const linePoints = useMemo(
    () =>
      dailyTotals.map((d) => ({
        label: String(d.day),
        value: d.expense,
      })),
    [dailyTotals],
  );

  const hasData = localEntries.length > 0;

  return (
    <div className="agg-tab">
      {/* ── サマリー ── */}
      <section className="agg-summary">
        <h3 className="agg-section-title">月の集計サマリー</h3>
        <div className="agg-summary-grid">
          <div className="agg-summary-item">
            <span className="agg-label">支出合計</span>
            <span className="agg-value">¥{fmt(summary.totalExpense)}</span>
          </div>
          <div className="agg-summary-item">
            <span className="agg-label">収入合計</span>
            <span className="agg-value">¥{fmt(summary.totalIncome)}</span>
          </div>
          <div className="agg-summary-item">
            <span className="agg-label">収支差額</span>
            <span
              className="agg-value"
              style={{
                color: summary.netBalance < 0 ? "#e74c3c" : "#27ae60",
              }}
            >
              ¥{fmt(summary.netBalance)}
            </span>
          </div>
          {summary.monthlyBudget != null && (
            <div className="agg-summary-item">
              <span className="agg-label">予算残</span>
              <span
                className="agg-value"
                style={{
                  color: summary.budgetRemaining! < 0 ? "#e74c3c" : "#27ae60",
                }}
              >
                ¥{fmt(summary.budgetRemaining!)}
              </span>
            </div>
          )}
          <div className="agg-summary-item">
            <span className="agg-label">支出件数</span>
            <span className="agg-value">{summary.expenseCount}件</span>
          </div>
          {summary.incomeCount > 0 && (
            <div className="agg-summary-item">
              <span className="agg-label">収入件数</span>
              <span className="agg-value">{summary.incomeCount}件</span>
            </div>
          )}
        </div>
      </section>

      {/* ── カテゴリ別支出 ── */}
      <section className="agg-section">
        <h3 className="agg-section-title">カテゴリ別支出</h3>
        {grandTotal > 0 ? (
          <div className="agg-category-row">
            <PieChart slices={pieSlices} />
            <div className="agg-cat-table-wrapper">
              <table className="agg-cat-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>カテゴリ</th>
                    <th className="agg-num">金額</th>
                    <th className="agg-num">割合</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryItems.map((c) => (
                    <tr key={c.categoryId}>
                      <td>
                        <span
                          className="agg-color-swatch"
                          style={{ background: c.color }}
                        />
                      </td>
                      <td>{c.name}</td>
                      <td className="agg-num">¥{fmt(c.total)}</td>
                      <td className="agg-num">{c.percentage.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td></td>
                    <td><strong>合計</strong></td>
                    <td className="agg-num">
                      <strong>¥{fmt(grandTotal)}</strong>
                    </td>
                    <td className="agg-num"><strong>100%</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : (
          <p className="empty-message">支出データがありません</p>
        )}
      </section>

      {/* ── 日別支出推移 ── */}
      <section className="agg-section">
        <h3 className="agg-section-title">日別支出推移</h3>
        {hasData ? (
          <LineChart
            points={linePoints}
            budgetLine={defaultDayBudget}
          />
        ) : (
          <p className="empty-message">この月のデータはまだありません</p>
        )}
      </section>
    </div>
  );
}
