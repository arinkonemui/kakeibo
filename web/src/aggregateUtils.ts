/**
 * Pure computation functions for the aggregate tab.
 * No side effects, no DB access — all calculations from already-loaded data.
 */

import type { CategoryRow, EntryRow, MonthRow } from "./types";

// --- Constants ---

export const CATEGORY_COLORS = [
  "#ff9f43", "#ff6b6b", "#f7c59f", "#e17055", "#fdcb6e", "#d35400",
  "#fab1a0", "#e77f67", "#f8a5c2", "#f3a683", "#c44569", "#574b90",
];

// --- Helpers ---

export function daysInMonth(monthKey: string): number {
  const [yearStr, monStr] = monthKey.split("-");
  return new Date(Number(yearStr), Number(monStr), 0).getDate();
}

export function fmt(n: number): string {
  return n.toLocaleString("ja-JP");
}

// --- Category Totals ---

export interface CategoryTotal {
  categoryId: string;
  name: string;
  total: number;
  percentage: number; // 0–100
  color: string;
}

export function computeCategoryTotals(
  entries: EntryRow[],
  categories: CategoryRow[],
): { items: CategoryTotal[]; grandTotal: number } {
  // Sum expenses per category
  const totalsMap = new Map<string, number>();
  let grandTotal = 0;
  for (const e of entries) {
    if (e.type !== "expense") continue;
    totalsMap.set(e.category_id, (totalsMap.get(e.category_id) ?? 0) + e.amount);
    grandTotal += e.amount;
  }

  // Build active expense categories sorted by sort_order
  const activeCats = categories
    .filter((c) => c.is_active === 1 && (c.kind === "expense" || c.kind === "both"))
    .sort((a, b) => {
      const sa = a.sort_order ?? Infinity;
      const sb = b.sort_order ?? Infinity;
      return sa - sb || a.name.localeCompare(b.name);
    });

  // Map to CategoryTotal, include only categories with > 0 total
  const items: CategoryTotal[] = [];
  for (let i = 0; i < activeCats.length; i++) {
    const cat = activeCats[i]!;
    const total = totalsMap.get(cat.category_id) ?? 0;
    if (total <= 0) continue;
    items.push({
      categoryId: cat.category_id,
      name: cat.name,
      total,
      percentage: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]!,
    });
  }

  // Sort descending by total
  items.sort((a, b) => b.total - a.total);

  return { items, grandTotal };
}

// --- Daily Totals ---

export interface DailyTotal {
  day: number;
  dateStr: string;
  expense: number;
}

export function computeDailyTotals(
  entries: EntryRow[],
  monthKey: string,
): DailyTotal[] {
  const days = daysInMonth(monthKey);
  const dailyMap = new Map<string, number>();

  for (const e of entries) {
    if (e.type !== "expense") continue;
    dailyMap.set(e.date, (dailyMap.get(e.date) ?? 0) + e.amount);
  }

  const result: DailyTotal[] = [];
  for (let d = 1; d <= days; d++) {
    const dateStr = `${monthKey}-${String(d).padStart(2, "0")}`;
    result.push({
      day: d,
      dateStr,
      expense: dailyMap.get(dateStr) ?? 0,
    });
  }

  return result;
}

// --- Monthly Summary ---

export interface MonthlySummary {
  totalExpense: number;
  totalIncome: number;
  netBalance: number; // income - expense
  monthlyBudget: number | null;
  budgetRemaining: number | null;
  expenseCount: number;
  incomeCount: number;
}

export function computeMonthlySummary(
  entries: EntryRow[],
  month: MonthRow | null,
): MonthlySummary {
  let totalExpense = 0;
  let totalIncome = 0;
  let expenseCount = 0;
  let incomeCount = 0;

  for (const e of entries) {
    if (e.type === "expense") {
      totalExpense += e.amount;
      expenseCount++;
    } else if (e.type === "income") {
      totalIncome += e.amount;
      incomeCount++;
    }
  }

  const monthlyBudget = month?.monthly_budget ?? null;
  const budgetRemaining = monthlyBudget != null ? monthlyBudget - totalExpense : null;

  return {
    totalExpense,
    totalIncome,
    netBalance: totalIncome - totalExpense,
    monthlyBudget,
    budgetRemaining,
    expenseCount,
    incomeCount,
  };
}
