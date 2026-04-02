import { useEffect, useState } from "react";
import { saveBudget } from "./api";
import { FixedExpensesSection } from "./FixedExpensesSection";
import type { MonthlyDataset } from "./types";

interface Props {
  data: MonthlyDataset;
  monthKey: string;
  /** Merged daily budget overrides: server daily_budgets + local ops */
  localDailyBudgets: Map<string, number>;
  editable: boolean;
  onSetDailyBudget: (date: string, amount: number) => void;
  onDeleteDailyBudget: (date: string) => void;
  /** Called after monthly_budget is saved so the parent can refetch */
  onBudgetSaved: () => void;
}

function fmt(n: number): string {
  return n.toLocaleString("ja-JP");
}

function daysInMonth(monthKey: string): number {
  const [yearStr, monStr] = monthKey.split("-");
  return new Date(Number(yearStr), Number(monStr), 0).getDate();
}

export function SettingsTab({
  data,
  monthKey,
  localDailyBudgets,
  editable,
  onSetDailyBudget,
  onDeleteDailyBudget,
  onBudgetSaved,
}: Props) {
  const currentMonthlyBudget = data.month?.monthly_budget ?? null;

  // Monthly budget form
  // Initialized empty; synced from data via useEffect so month-switch always shows correct value
  const [budgetInput, setBudgetInput] = useState(
    currentMonthlyBudget != null ? String(currentMonthlyBudget) : "",
  );
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [budgetSaved, setBudgetSaved] = useState(false);

  // Sync input whenever data changes (new month loaded or refetch after save)
  useEffect(() => {
    setBudgetInput(
      data.month?.monthly_budget != null
        ? String(data.month.monthly_budget)
        : "",
    );
    setBudgetError(null);
    setBudgetSaved(false);
  }, [data]);

  // Daily budget override form
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideAmount, setOverrideAmount] = useState("");

  const days = daysInMonth(monthKey);
  const monthlyBudget = currentMonthlyBudget;
  const defaultDayBudget =
    monthlyBudget != null ? Math.floor(monthlyBudget / days) : null;

  // Sum of all day budget overrides
  let totalOverrides = 0;
  for (const [, v] of localDailyBudgets) totalOverrides += v;
  const overrideSumWarning =
    monthlyBudget != null &&
    localDailyBudgets.size > 0 &&
    totalOverrides > monthlyBudget;

  const handleSaveMonthlyBudget = async () => {
    const trimmed = budgetInput.trim();
    const parsed = trimmed === "" ? null : parseInt(trimmed, 10);
    if (trimmed !== "" && (!parsed || parsed < 0)) return;
    setBudgetSaving(true);
    setBudgetError(null);
    setBudgetSaved(false);
    const result = await saveBudget(monthKey, parsed);
    setBudgetSaving(false);
    if ("error" in result) {
      setBudgetError(result.error);
      return;
    }
    setBudgetSaved(true);
    onBudgetSaved();
  };

  const handleAddOverride = () => {
    const amt = parseInt(overrideAmount, 10);
    if (!overrideDate || !amt || amt <= 0) return;
    onSetDailyBudget(overrideDate, amt);
    setOverrideDate("");
    setOverrideAmount("");
  };

  // Sorted override entries for display
  const sortedOverrides = [...localDailyBudgets.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  const minDate = `${monthKey}-01`;
  const maxDate = `${monthKey}-${String(days).padStart(2, "0")}`;

  return (
    <div className="settings-tab">
      {/* ── 月予算 ── */}
      <section className="settings-section">
        <h3>月予算</h3>
        <div className="form-row">
          <label>
            月予算 (円):
            <input
              type="number"
              min="0"
              value={budgetInput}
              onChange={(e) => {
                setBudgetInput(e.target.value);
                setBudgetSaved(false);
              }}
              placeholder="例: 100000"
              disabled={!editable}
            />
          </label>
        </div>

        {defaultDayBudget != null && (
          <p className="budget-hint">
            デフォルト日予算: <strong>¥{fmt(defaultDayBudget)}</strong> / 日（
            {days}日で按分）
          </p>
        )}

        {editable && (
          <div className="form-actions">
            <button
              className="btn-add"
              onClick={handleSaveMonthlyBudget}
              disabled={budgetSaving}
            >
              {budgetSaving ? "保存中…" : "月予算を保存"}
            </button>
          </div>
        )}

        {budgetError && (
          <p className="budget-error">エラー: {budgetError}</p>
        )}
        {budgetSaved && (
          <p className="budget-saved">月予算を保存しました</p>
        )}
      </section>

      {/* ── 固定費 ── */}
      <FixedExpensesSection />

      {/* ── 日別予算上書き ── */}
      <section className="settings-section">
        <h3>日別予算上書き</h3>

        {overrideSumWarning && (
          <p className="budget-warning">
            ⚠ 日別予算の合計（¥{fmt(totalOverrides)}）が月予算（¥
            {fmt(monthlyBudget!)}）を超えています
          </p>
        )}

        {sortedOverrides.length > 0 ? (
          <ul className="override-list">
            {sortedOverrides.map(([date, amount]) => (
              <li key={date} className="override-item">
                <span className="override-date">{date}</span>
                <span className="override-amount">¥{fmt(amount)}</span>
                {editable && (
                  <button
                    className="btn-delete"
                    onClick={() => onDeleteDailyBudget(date)}
                  >
                    削除
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-message">日別上書きはありません</p>
        )}

        {editable && (
          <div className="override-form">
            <label>
              日付:
              <input
                type="date"
                value={overrideDate}
                min={minDate}
                max={maxDate}
                onChange={(e) => setOverrideDate(e.target.value)}
              />
            </label>
            <label>
              予算額:
              <input
                type="number"
                min="0"
                value={overrideAmount}
                placeholder="例: 3000"
                onChange={(e) => setOverrideAmount(e.target.value)}
              />
            </label>
            <button
              className="btn-add"
              onClick={handleAddOverride}
              disabled={!overrideDate || !overrideAmount}
            >
              追加 / 更新
            </button>
          </div>
        )}

        {localDailyBudgets.size > 0 && (
          <p className="override-hint">
            ※ 日別上書きの変更は画面下の「保存」ボタンで一括保存されます
          </p>
        )}
      </section>
    </div>
  );
}
