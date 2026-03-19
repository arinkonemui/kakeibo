/** API response types matching GET /api/monthly */

export interface MonthRow {
  user_id: string;
  month_key: string;
  version: number;
  monthly_budget: number | null;
  cutoff_type: string;
  cutoff_day: number | null;
  updated_at: string;
}

export interface CategoryRow {
  category_id: string;
  user_id: string;
  name: string;
  kind: string; // 'expense' | 'income' | 'both'
  is_active: number; // 0 | 1
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface EntryRow {
  entry_id: string;
  user_id: string;
  month_key: string;
  date: string; // YYYY-MM-DD
  type: string; // 'expense' | 'income'
  amount: number;
  category_id: string;
  memo: string | null;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyBudgetRow {
  user_id: string;
  month_key: string;
  date: string; // YYYY-MM-DD
  daily_budget_override: number;
  created_at: string;
  updated_at: string;
}

export interface MonthlyDataset {
  month: MonthRow | null;
  categories: CategoryRow[];
  entries: EntryRow[];
  daily_budgets: DailyBudgetRow[];
}

// --- POST /api/monthly types ---

export interface CreateEntryOp {
  entry_id?: string;
  date: string;
  type: "expense" | "income";
  amount: number;
  category_id: string;
  memo?: string | null;
  payment_method?: string | null;
}

export interface UpdateEntryOp {
  entry_id: string;
  date: string;
  type: "expense" | "income";
  amount: number;
  category_id: string;
  memo?: string | null;
  payment_method?: string | null;
}

export interface SaveOps {
  create_entries?: CreateEntryOp[];
  update_entries?: UpdateEntryOp[];
  delete_entry_ids?: string[];
}

export interface SaveResponse {
  ok: true;
  month_key: string;
  new_version: number;
  applied: Record<string, number>;
}

export interface SaveConflict {
  conflict: true;
  message: string;
}

export type SaveResult = SaveResponse | SaveConflict | { error: string };
