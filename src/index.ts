import { type AuthEnv, AuthError, getAuthUserId } from "./auth";
import { handleDeleteAccount, handleLogin, handlePatchProfile, handleRegister, handleResetRequest, handleResetPassword } from "./authApi";
import { handleDeleteCategory, handlePatchCategory, handlePostCategory } from "./categories";
import {
  handleDeleteFixedExpense,
  handleGetFixedExpenses,
  handlePatchFixedExpense,
  handlePostFixedExpense,
} from "./fixed-expenses";
import { handlePostMonthly } from "./save";
import { handlePostSettings } from "./settings";

export interface Env extends AuthEnv {
  DB: D1Database;
  /** 本番環境でのサブディレクトリプレフィックス（例: /apps/kakeibo） */
  BASE_PATH?: string;
  /** 静的アセット配信バインディング（[assets] 設定時に自動付与） */
  ASSETS?: { fetch(req: Request): Promise<Response> };
  /** Resend API キー（メール送信用） */
  RESEND_API_KEY?: string;
  /** メール送信元アドレス（例: "おさいふノート <noreply@arinkolab.com>"） */
  MAIL_FROM?: string;
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
    // サブディレクトリプレフィックスをストリップ（本番: /apps/kakeibo/api/* → /api/*）
    const basePath = env.BASE_PATH ?? "";
    const pathname =
      basePath && url.pathname.startsWith(basePath)
        ? url.pathname.slice(basePath.length) || "/"
        : url.pathname;

    // --- 非APIリクエスト → React 静的ファイルを配信（SPA フォールバック付き）---
    if (!pathname.startsWith("/api/")) {
      if (env.ASSETS) {
        // ルートは index.html へ
        const filePath = pathname === "/" ? "/index.html" : pathname;
        // ダミーホストを使用（実ドメインだと Cloudflare がリダイレクトを返すため）
        const assetRes = await env.ASSETS.fetch(new Request(`http://assets.local${filePath}`));
        // ファイルが見つからない場合は SPA の index.html を返す
        if (assetRes.status === 404) {
          return env.ASSETS.fetch(new Request("http://assets.local/index.html"));
        }
        return assetRes;
      }
      return errorResponse(404, "Not found.");
    }

    // --- Public auth endpoints (no token required) ---
    if (pathname === "/api/auth/register" && request.method === "POST") {
      if (!env.AUTH_SECRET) return errorResponse(500, "Internal Server Error");
      return handleRegister(env.DB, env.AUTH_SECRET, request);
    }
    if (pathname === "/api/auth/login" && request.method === "POST") {
      if (!env.AUTH_SECRET) return errorResponse(500, "Internal Server Error");
      return handleLogin(env.DB, env.AUTH_SECRET, request);
    }
    if (pathname === "/api/auth/reset-request" && request.method === "POST") {
      return handleResetRequest(env.DB, request, env.RESEND_API_KEY, env.MAIL_FROM);
    }
    if (pathname === "/api/auth/reset-password" && request.method === "POST") {
      return handleResetPassword(env.DB, request);
    }

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
    if (pathname === "/api/auth/profile" && request.method === "PATCH") {
      return handlePatchProfile(env.DB, user_id, request);
    }
    if (pathname === "/api/auth/account" && request.method === "DELETE") {
      return handleDeleteAccount(env.DB, user_id, request);
    }

    if (pathname === "/api/monthly" && request.method === "GET") {
      const month_key = validateMonthKey(url);
      if (month_key instanceof Response) return month_key;
      return handleGetMonthly(env.DB, user_id, month_key);
    }

    if (pathname === "/api/monthly" && request.method === "POST") {
      return handlePostMonthly(env.DB, user_id, request);
    }

    if (pathname === "/api/settings" && request.method === "POST") {
      return handlePostSettings(env.DB, user_id, request);
    }

    if (pathname === "/api/categories" && request.method === "POST") {
      return handlePostCategory(env.DB, user_id, request);
    }

    if (pathname === "/api/fixed-expenses" && request.method === "GET") {
      const month_key = validateMonthKey(url);
      if (month_key instanceof Response) return month_key;
      return handleGetFixedExpenses(env.DB, user_id, month_key);
    }

    if (pathname === "/api/fixed-expenses" && request.method === "POST") {
      return handlePostFixedExpense(env.DB, user_id, request);
    }

    const feMatch = pathname.match(/^\/api\/fixed-expenses\/([^/]+)$/);
    if (feMatch) {
      const feId = feMatch[1]!;
      if (request.method === "PATCH") {
        return handlePatchFixedExpense(env.DB, user_id, feId, request);
      }
      if (request.method === "DELETE") {
        return handleDeleteFixedExpense(env.DB, user_id, feId);
      }
    }

    const catMatch = pathname.match(/^\/api\/categories\/([^/]+)$/);
    if (catMatch) {
      const categoryId = catMatch[1]!;
      if (request.method === "PATCH") {
        return handlePatchCategory(env.DB, user_id, categoryId, request);
      }
      if (request.method === "DELETE") {
        return handleDeleteCategory(env.DB, user_id, categoryId);
      }
    }

    return errorResponse(404, "Not found.");
  },
} satisfies ExportedHandler<Env>;
