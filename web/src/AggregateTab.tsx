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
import type { EntryRow, FixedExpenseRow, MonthlyDataset } from "./types";

const FX_PALETTE = [
  "#e8a838", "#4a9fd4", "#e74c3c", "#2ecc71", "#9b59b6",
  "#1abc9c", "#f39c12", "#3498db", "#e67e22", "#16a085",
];

interface Props {
  data: MonthlyDataset;
  monthKey: string;
  localEntries: EntryRow[];
  fxExpenseItems: FixedExpenseRow[];
  fxIncomeItems: FixedExpenseRow[];
}

export function AggregateTab({ data, monthKey, localEntries, fxExpenseItems, fxIncomeItems }: Props) {
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

  // Fixed expense / income totals
  const fixedExpenseTotal = useMemo(
    () => fxExpenseItems.reduce((s, i) => s + i.amount, 0),
    [fxExpenseItems],
  );
  const incomeTotal = useMemo(
    () => fxIncomeItems.reduce((s, i) => s + i.amount, 0),
    [fxIncomeItems],
  );
  const grandExpenseTotal = fixedExpenseTotal + summary.totalExpense;
  const netBalance = incomeTotal - grandExpenseTotal;

  // Default daily budget for the line chart reference line
  const defaultDayBudget = useMemo(() => {
    if (summary.monthlyBudget == null) return null;
    return Math.floor(summary.monthlyBudget / daysInMonth(monthKey));
  }, [summary.monthlyBudget, monthKey]);

  // Pie chart slices (category expenses)
  const pieSlices = useMemo(
    () =>
      categoryItems.map((c) => ({
        label: c.name,
        value: c.total,
        color: c.color,
      })),
    [categoryItems],
  );

  // Pie chart slices for fixed expenses
  const fxExpenseSlices = useMemo(
    () =>
      fxExpenseItems
        .filter((i) => i.amount > 0)
        .map((i, idx) => ({
          label: i.name,
          value: i.amount,
          color: FX_PALETTE[idx % FX_PALETTE.length]!,
        })),
    [fxExpenseItems],
  );

  // Pie chart slices for income
  const fxIncomeSlices = useMemo(
    () =>
      fxIncomeItems
        .filter((i) => i.amount > 0)
        .map((i, idx) => ({
          label: i.name,
          value: i.amount,
          color: FX_PALETTE[(idx + 4) % FX_PALETTE.length]!,
        })),
    [fxIncomeItems],
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
            <span className="agg-label">固定費</span>
            <span className="agg-value">¥{fmt(fixedExpenseTotal)}</span>
          </div>
          <div className="agg-summary-item">
            <span className="agg-label">支出額</span>
            <span className="agg-value">¥{fmt(summary.totalExpense)}</span>
          </div>
          <div className="agg-summary-item">
            <span className="agg-label">支出総合計</span>
            <span className="agg-value">¥{fmt(grandExpenseTotal)}</span>
          </div>
          <div className="agg-summary-item">
            <span className="agg-label">収入額</span>
            <span className="agg-value">¥{fmt(incomeTotal)}</span>
          </div>
          <div className="agg-summary-item">
            <span className="agg-label">収支差額</span>
            <span
              className="agg-value"
              style={{ color: netBalance < 0 ? "#e74c3c" : "#27ae60" }}
            >
              ¥{fmt(netBalance)}
            </span>
          </div>
          <div className="agg-summary-item">
            <span className="agg-label">支出件数</span>
            <span className="agg-value">{summary.expenseCount}件</span>
          </div>
        </div>
      </section>

      {/* ── 固定費・収入 内訳 ── */}
      <section className="agg-section">
        <h3 className="agg-section-title">固定費・収入 内訳</h3>
        <div className="agg-fx-row">
          {/* 固定費 */}
          <div className="agg-fx-block">
            <h4 className="agg-fx-subtitle">固定費</h4>
            {fxExpenseItems.some((i) => i.amount > 0) ? (
              <div className="agg-category-row">
                <PieChart slices={fxExpenseSlices} size={180} />
                <table className="agg-cat-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>項目</th>
                      <th className="agg-num">金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fxExpenseItems
                      .filter((i) => i.amount > 0)
                      .map((i, idx) => (
                        <tr key={i.fixed_expense_id}>
                          <td>
                            <span
                              className="agg-color-swatch"
                              style={{ background: FX_PALETTE[idx % FX_PALETTE.length] }}
                            />
                          </td>
                          <td>{i.name}</td>
                          <td className="agg-num">¥{fmt(i.amount)}</td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td></td>
                      <td><strong>合計</strong></td>
                      <td className="agg-num"><strong>¥{fmt(fixedExpenseTotal)}</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="empty-message">固定費データがありません</p>
            )}
          </div>

          {/* 収入 */}
          <div className="agg-fx-block">
            <h4 className="agg-fx-subtitle">収入</h4>
            {fxIncomeItems.some((i) => i.amount > 0) ? (
              <div className="agg-category-row">
                <PieChart slices={fxIncomeSlices} size={180} />
                <table className="agg-cat-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>項目</th>
                      <th className="agg-num">金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fxIncomeItems
                      .filter((i) => i.amount > 0)
                      .map((i, idx) => (
                        <tr key={i.fixed_expense_id}>
                          <td>
                            <span
                              className="agg-color-swatch"
                              style={{ background: FX_PALETTE[(idx + 4) % FX_PALETTE.length] }}
                            />
                          </td>
                          <td>{i.name}</td>
                          <td className="agg-num">¥{fmt(i.amount)}</td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td></td>
                      <td><strong>合計</strong></td>
                      <td className="agg-num"><strong>¥{fmt(incomeTotal)}</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="empty-message">収入データがありません</p>
            )}
          </div>
        </div>
      </section>

      {/* ── カテゴリ別支出 ── */}
      <section className="agg-section">
        <h3 className="agg-section-title">カテゴリ別支出 内訳</h3>
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
