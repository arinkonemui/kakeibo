import { type AuthEnv, AuthError, getAuthUserId } from "./auth";

export interface Env extends AuthEnv {
  DB: D1Database;
}

// --- Types ---

interface MonthRow {
  user_id: string;
  month_key: string;
  version: number;
  monthly_budget: number | null;
  cutoff_type: string;
  cutoff_day: number | null;
  updated_at: string;
}

interface CategoryRow {
  category_id: string;
  user_id: string;
  name: string;
  kind: string;
  is_active: number;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

interface EntryRow {
  entry_id: string;
  user_id: string;
  month_key: string;
  date: string;
  type: string;
  amount: number;
  category_id: string;
  memo: string | null;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
}

interface DailyBudgetRow {
  user_id: string;
  month_key: string;
  date: string;
  daily_budget_override: number;
  created_at: string;
  updated_at: string;
}

interface MonthlyDatasetResponse {
  month: MonthRow | null;
  categories: CategoryRow[];
  entries: EntryRow[];
  daily_budgets: DailyBudgetRow[];
}

// --- Validation ---

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function validateMonthKey(url: URL): string | Response {
  const month_key = url.searchParams.get("month_key");
  if (!month_key || !MONTH_KEY_RE.test(month_key)) {
    return errorResponse(400, "month_key must be in YYYY-MM format.");
  }
  return month_key;
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// --- Handler ---

async function handleGetMonthly(
  db: D1Database,
  user_id: string,
  month_key: string,
): Promise<Response> {
  // 4 queries in parallel: months, categories, entries, daily_budgets
  const [monthResult, categoriesResult, entriesResult, dailyBudgetsResult] =
    await Promise.all([
      db
        .prepare(
          "SELECT user_id, month_key, version, monthly_budget, cutoff_type, cutoff_day, updated_at FROM months WHERE user_id = ? AND month_key = ?",
        )
        .bind(user_id, month_key)
        .first<MonthRow>(),

      db
        .prepare(
          "SELECT category_id, user_id, name, kind, is_active, sort_order, created_at, updated_at FROM categories WHERE user_id = ? ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END, sort_order, name",
        )
        .bind(user_id)
        .all<CategoryRow>(),

      db
        .prepare(
          "SELECT entry_id, user_id, month_key, date, type, amount, category_id, memo, payment_method, created_at, updated_at FROM entries WHERE user_id = ? AND month_key = ? ORDER BY date ASC, created_at ASC",
        )
        .bind(user_id, month_key)
        .all<EntryRow>(),

      db
        .prepare(
          "SELECT user_id, month_key, date, daily_budget_override, created_at, updated_at FROM daily_budgets WHERE user_id = ? AND month_key = ? ORDER BY date ASC",
        )
        .bind(user_id, month_key)
        .all<DailyBudgetRow>(),
    ]);

  const body: MonthlyDatasetResponse = {
    month: monthResult ?? null,
    categories: categoriesResult.results,
    entries: entriesResult.results,
    daily_budgets: dailyBudgetsResult.results,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// --- Worker entry ---

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // --- Auth: derive user_id from request ---
    let user_id: string;
    try {
      user_id = await getAuthUserId(request, env);
    } catch (e) {
      if (e instanceof AuthError) {
        return errorResponse(e.status, e.message);
      }
      return errorResponse(500, "Internal Server Error");
    }

    // --- Routing ---
    if (url.pathname === "/api/monthly" && request.method === "GET") {
      const month_key = validateMonthKey(url);
      if (month_key instanceof Response) return month_key;
      return handleGetMonthly(env.DB, user_id, month_key);
    }

    return errorResponse(404, "Not found.");
  },
} satisfies ExportedHandler<Env>;
