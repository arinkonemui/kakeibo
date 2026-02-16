import type { MonthlyDataset } from "./types";

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
