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
import type { EntryRow, FixedExpenseRow, MonthlyDataset } from "./types";

const FX_PALETTE = [
  "#e8a838", "#4a9fd4", "#e74c3c", "#2ecc71", "#9b59b6",
  "#1abc9c", "#f39c12", "#3498db", "#e67e22", "#16a085",
];

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
  fxExpenseItems: FixedExpenseRow[];
  fxIncomeItems: FixedExpenseRow[];
}

export function PdfPrintLayout({ monthKey, data, localEntries, fxExpenseItems, fxIncomeItems }: Props) {
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

  // 収入内訳スライス（固定費 + カテゴリ支出）
  const incomeBreakdownItems = useMemo(() => {
    const items: { label: string; value: number; color: string }[] = [];
    fxExpenseItems
      .filter((i) => i.amount > 0)
      .forEach((i, idx) => {
        items.push({ label: i.name, value: i.amount, color: FX_PALETTE[idx % FX_PALETTE.length]! });
      });
    categoryItems
      .filter((c) => c.total > 0)
      .forEach((c) => {
        items.push({ label: c.name, value: c.total, color: c.color });
      });
    return items;
  }, [fxExpenseItems, categoryItems]);

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

  const [year, month] = monthKey.split("-");
  const monthLabel = `${year}年${month}月`;

  const content = (
    <div className="pdf-root">
      {/* ===== 1枚目: グラフ＋合算値 ===== */}
      <div className="pdf-page">
        <header className="pdf-header">
          <span className="pdf-app-name">おさいふノート</span>
          <span className="pdf-header-title">{monthLabel} 集計</span>
        </header>

        {/* サマリー */}
        <section className="pdf-summary">
          <div className="pdf-summary-item">
            <span className="pdf-summary-label">固定費</span>
            <span className="pdf-summary-value">¥{fmt(fixedExpenseTotal)}</span>
          </div>
          <div className="pdf-summary-item">
            <span className="pdf-summary-label">支出額</span>
            <span className="pdf-summary-value">¥{fmt(summary.totalExpense)}</span>
          </div>
          <div className="pdf-summary-item">
            <span className="pdf-summary-label">支出総合計</span>
            <span className="pdf-summary-value">¥{fmt(grandExpenseTotal)}</span>
          </div>
          <div className="pdf-summary-item">
            <span className="pdf-summary-label">収入額</span>
            <span className="pdf-summary-value">¥{fmt(incomeTotal)}</span>
          </div>
          <div className="pdf-summary-item">
            <span className="pdf-summary-label">収支差額</span>
            <span
              className="pdf-summary-value"
              style={{ color: netBalance < 0 ? "#e74c3c" : "#27ae60" }}
            >
              ¥{fmt(netBalance)}
            </span>
          </div>
          <div className="pdf-summary-item">
            <span className="pdf-summary-label">支出件数</span>
            <span className="pdf-summary-value">{summary.expenseCount}件</span>
          </div>
        </section>

        {/* 収入に対する支出 内訳 */}
        {incomeTotal > 0 && incomeBreakdownItems.length > 0 && (
          <section className="pdf-section">
            <h3 className="pdf-section-title">収入に対する支出 内訳</h3>
            <div className="pdf-category-row">
              <div className="pdf-pie-wrapper">
                <PieChart slices={incomeBreakdownItems} size={110} />
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
                  {incomeBreakdownItems.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <span className="pdf-color-dot" style={{ background: item.color }} />
                        {item.label}
                      </td>
                      <td className="pdf-num">¥{fmt(item.value)}</td>
                      <td className="pdf-num">
                        {((item.value / incomeTotal) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="pdf-tfoot-row">
                    <td>支出総合計</td>
                    <td className="pdf-num">¥{fmt(grandExpenseTotal)}</td>
                    <td className="pdf-num">
                      {((grandExpenseTotal / incomeTotal) * 100).toFixed(1)}%
                    </td>
                  </tr>
                  <tr className="pdf-tfoot-row">
                    <td style={{ color: netBalance < 0 ? "#e74c3c" : "#27ae60" }}>収支差額</td>
                    <td className="pdf-num" style={{ color: netBalance < 0 ? "#e74c3c" : "#27ae60" }}>
                      ¥{fmt(netBalance)}
                    </td>
                    <td className="pdf-num" style={{ color: netBalance < 0 ? "#e74c3c" : "#27ae60" }}>
                      {((netBalance / incomeTotal) * 100).toFixed(1)}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {/* 固定費・収入 内訳 */}
        <section className="pdf-section">
          <h3 className="pdf-section-title">固定費・収入 内訳</h3>
          <div className="pdf-fx-row">
            {/* 固定費 */}
            <div className="pdf-fx-block">
              <div className="pdf-fx-subtitle">固定費</div>
              {fxExpenseItems.some((i) => i.amount > 0) ? (
                <div className="pdf-category-row">
                  <div className="pdf-pie-wrapper">
                    <PieChart slices={fxExpenseSlices} size={90} />
                  </div>
                  <table className="pdf-cat-table">
                    <thead>
                      <tr>
                        <th>項目</th>
                        <th className="pdf-num">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fxExpenseItems
                        .filter((i) => i.amount > 0)
                        .map((i, idx) => (
                          <tr key={i.fixed_expense_id}>
                            <td>
                              <span
                                className="pdf-color-dot"
                                style={{ background: FX_PALETTE[idx % FX_PALETTE.length] }}
                              />
                              {i.name}
                            </td>
                            <td className="pdf-num">¥{fmt(i.amount)}</td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr className="pdf-tfoot-row">
                        <td>合計</td>
                        <td className="pdf-num">¥{fmt(fixedExpenseTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p className="pdf-empty">固定費データなし</p>
              )}
            </div>

            {/* 収入 */}
            <div className="pdf-fx-block">
              <div className="pdf-fx-subtitle">収入</div>
              {fxIncomeItems.some((i) => i.amount > 0) ? (
                <div className="pdf-category-row">
                  <div className="pdf-pie-wrapper">
                    <PieChart slices={fxIncomeSlices} size={90} />
                  </div>
                  <table className="pdf-cat-table">
                    <thead>
                      <tr>
                        <th>項目</th>
                        <th className="pdf-num">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fxIncomeItems
                        .filter((i) => i.amount > 0)
                        .map((i, idx) => (
                          <tr key={i.fixed_expense_id}>
                            <td>
                              <span
                                className="pdf-color-dot"
                                style={{ background: FX_PALETTE[(idx + 4) % FX_PALETTE.length] }}
                              />
                              {i.name}
                            </td>
                            <td className="pdf-num">¥{fmt(i.amount)}</td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr className="pdf-tfoot-row">
                        <td>合計</td>
                        <td className="pdf-num">¥{fmt(incomeTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p className="pdf-empty">収入データなし</p>
              )}
            </div>
          </div>
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

      {/* ===== 2枚目: 月間マトリクス ===== */}
      <div className="pdf-page pdf-page-last">
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
              <th className="pdf-col-summary">合計</th>
            </tr>
          </thead>
          <tbody>
            {matrixRows.map((row) => {
              const dow = new Date(row.dateStr).getDay();
              const isWeekend = dow === 0 || dow === 6;
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
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
