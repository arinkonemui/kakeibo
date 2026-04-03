import type { CategoryRow, FixedExpenseRow, MonthlyDataset, SaveOps, SaveResult } from "./types";

const DEV_USER_KEY = "osaifu_dev_user_id";
const TOKEN_KEY = "osaifu_token";

/** Check if running in local dev environment */
function isLocalDev(): boolean {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

/** Get stored dev user_id (only used in local dev) */
export function getDevUserId(): string {
  if (!isLocalDev()) return "";
  return localStorage.getItem(DEV_USER_KEY) ?? "";
}

/** Set dev user_id in localStorage */
export function setDevUserId(userId: string): void {
  if (userId) {
    localStorage.setItem(DEV_USER_KEY, userId);
  } else {
    localStorage.removeItem(DEV_USER_KEY);
  }
}

/** Build common headers.
 * Priority: Bearer token (if logged in) → X-Debug-User (local dev fallback)
 */
function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    // Logged-in via auth system (works on both localhost and prod)
    headers["Authorization"] = `Bearer ${token}`;
  } else if (isLocalDev()) {
    // Local dev fallback: DevUserBar
    const devUser = getDevUserId();
    if (devUser) headers["X-Debug-User"] = devUser;
  }
  return headers;
}

/** Fetch monthly dataset from API */
export async function fetchMonthlyDataset(
  monthKey: string,
): Promise<MonthlyDataset> {
  const res = await fetch(`/api/monthly?month_key=${monthKey}`, {
    headers: buildHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `HTTP ${res.status}`,
    );
  }
  return res.json() as Promise<MonthlyDataset>;
}

/** Save monthly data via POST /api/monthly */
export async function saveMonthly(
  monthKey: string,
  expectedVersion: number,
  ops: SaveOps,
): Promise<SaveResult> {
  const res = await fetch("/api/monthly", {
    method: "POST",
    headers: { ...buildHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      month_key: monthKey,
      expected_version: expectedVersion,
      ops,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 409) {
    return {
      conflict: true,
      message:
        (body as { message?: string }).message ??
        "バージョンが競合しました。最新データを取得してください。",
    };
  }
  if (!res.ok) {
    return { error: (body as { error?: string }).error ?? `HTTP ${res.status}` };
  }
  return body as SaveResult;
}

// --- Settings ---

/** Save monthly budget via POST /api/settings */
export async function saveBudget(
  monthKey: string,
  monthlyBudget: number | null,
): Promise<{ ok: true } | { error: string }> {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { ...buildHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ month_key: monthKey, monthly_budget: monthlyBudget }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: (body as { error?: string }).error ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

// --- Category CRUD ---

export async function createCategory(
  name: string,
  kind: string,
): Promise<{ ok: true; category: CategoryRow } | { error: string }> {
  const res = await fetch("/api/categories", {
    method: "POST",
    headers: { ...buildHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ name, kind }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: (body as { error?: string }).error ?? `HTTP ${res.status}` };
  }
  return body as { ok: true; category: CategoryRow };
}

export async function updateCategory(
  categoryId: string,
  patch: { name?: string; kind?: string; is_active?: number },
): Promise<{ ok: true; category: CategoryRow } | { error: string }> {
  const res = await fetch(`/api/categories/${categoryId}`, {
    method: "PATCH",
    headers: { ...buildHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: (body as { error?: string }).error ?? `HTTP ${res.status}` };
  }
  return body as { ok: true; category: CategoryRow };
}

export async function deleteCategory(
  categoryId: string,
): Promise<{ ok: true } | { error: string }> {
  const res = await fetch(`/api/categories/${categoryId}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: (body as { error?: string }).error ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

// --- Fixed expenses ---

export async function fetchFixedExpenses(monthKey: string): Promise<FixedExpenseRow[]> {
  const res = await fetch(`/api/fixed-expenses?month_key=${monthKey}`, {
    headers: buildHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { ok: true; items: FixedExpenseRow[] };
  return data.items;
}

export async function createFixedExpense(
  monthKey: string,
  name: string,
  icon_key: string,
  amount: number,
  entry_type: string = "expense",
): Promise<{ ok: true; item: FixedExpenseRow } | { error: string }> {
  const res = await fetch("/api/fixed-expenses", {
    method: "POST",
    headers: { ...buildHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ month_key: monthKey, entry_type, name, icon_key, amount }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: (body as { error?: string }).error ?? `HTTP ${res.status}` };
  }
  return body as { ok: true; item: FixedExpenseRow };
}

export async function updateFixedExpense(
  id: string,
  patch: { name?: string; icon_key?: string; amount?: number },
): Promise<{ ok: true; item: FixedExpenseRow } | { error: string }> {
  const res = await fetch(`/api/fixed-expenses/${id}`, {
    method: "PATCH",
    headers: { ...buildHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: (body as { error?: string }).error ?? `HTTP ${res.status}` };
  }
  return body as { ok: true; item: FixedExpenseRow };
}

export async function deleteFixedExpense(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  const res = await fetch(`/api/fixed-expenses/${id}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: (body as { error?: string }).error ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

// --- Authentication ---

export interface AuthResponse {
  token: string;
  userId: string;
  displayName: string;
}

export async function authRegister(
  email: string,
  password: string,
  username?: string,
): Promise<AuthResponse | { error: string }> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, username }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: (body as { error?: string }).error ?? `HTTP ${res.status}` };
  }
  return body as AuthResponse;
}

export async function authLogin(
  email: string,
  password: string,
): Promise<AuthResponse | { error: string }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: (body as { error?: string }).error ?? `HTTP ${res.status}` };
  }
  return body as AuthResponse;
}

export async function updateProfile(patch: {
  username?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}): Promise<{ ok: true; displayName: string } | { error: string }> {
  const res = await fetch("/api/auth/profile", {
    method: "PATCH",
    headers: { ...buildHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: (body as { error?: string }).error ?? `HTTP ${res.status}` };
  }
  return body as { ok: true; displayName: string };
}
