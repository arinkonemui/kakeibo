/**
 * Month-key utilities.
 * Editable range: current month + previous 5 months (YYYY-MM unit).
 * Mirrors server-side logic in src/save.ts getEditableMonthKeys().
 */

export function getEditableMonthKeys(): Set<string> {
  const now = new Date();
  const keys = new Set<string>();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.add(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  return keys;
}

export function isEditableMonth(monthKey: string): boolean {
  return getEditableMonthKeys().has(monthKey);
}
