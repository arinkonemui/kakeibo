/**
 * POST /api/settings — update monthly_budget for a month.
 * No optimistic locking needed (budget is not versioned separately).
 * Uses INSERT OR IGNORE + UPDATE pair to upsert the months row.
 */

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function handlePostSettings(
  db: D1Database,
  user_id: string,
  request: Request,
): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse(400, "Invalid JSON body.");
  }

  if (!rawBody || typeof rawBody !== "object") {
    return errorResponse(400, "Invalid request body.");
  }

  const b = rawBody as Record<string, unknown>;

  if (typeof b.month_key !== "string" || !MONTH_KEY_RE.test(b.month_key)) {
    return errorResponse(400, "month_key must be in YYYY-MM format.");
  }

  // monthly_budget can be null (to clear) or a non-negative integer
  if (b.monthly_budget !== null && b.monthly_budget !== undefined) {
    if (
      typeof b.monthly_budget !== "number" ||
      !Number.isInteger(b.monthly_budget) ||
      b.monthly_budget < 0
    ) {
      return errorResponse(
        400,
        "monthly_budget must be a non-negative integer or null.",
      );
    }
  }

  const month_key = b.month_key;
  const monthly_budget =
    b.monthly_budget === undefined ? null : (b.monthly_budget as number | null);

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  // Upsert months row then update monthly_budget
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO months (user_id, month_key, version, cutoff_type, updated_at) VALUES (?, ?, 0, 'calendar', ?)",
      )
      .bind(user_id, month_key, now),
    db
      .prepare(
        "UPDATE months SET monthly_budget = ?, updated_at = ? WHERE user_id = ? AND month_key = ?",
      )
      .bind(monthly_budget, now, user_id, month_key),
  ]);

  return jsonResponse(200, { ok: true, month_key, monthly_budget });
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
