import type { CategoryRow, MonthlyDataset, SaveOps, SaveResult } from "./types";

const DEV_USER_KEY = "osaifu_dev_user_id";

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

/** Build common headers (adds X-Debug-User in local dev) */
function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  if (isLocalDev()) {
    const devUser = getDevUserId();
    if (devUser) {
      headers["X-Debug-User"] = devUser;
    }
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
