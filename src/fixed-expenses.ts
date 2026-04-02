/**
 * Fixed expenses CRUD handlers for /api/fixed-expenses
 * Stored at user level (no month_key) — carries over across months automatically.
 */

const VALID_ICON_KEYS = new Set(["home", "flame", "faucet", "bulb", "phone", "custom"]);

const DEFAULTS = [
  { name: "家賃",   icon_key: "home",   sort_order: 0 },
  { name: "ガス",   icon_key: "flame",  sort_order: 1 },
  { name: "水道",   icon_key: "faucet", sort_order: 2 },
  { name: "電気",   icon_key: "bulb",   sort_order: 3 },
  { name: "通信費", icon_key: "phone",  sort_order: 4 },
] as const;

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

interface FixedExpenseRow {
  fixed_expense_id: string;
  user_id: string;
  name: string;
  icon_key: string;
  amount: number;
  is_default: number;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLS =
  "fixed_expense_id, user_id, name, icon_key, amount, is_default, sort_order, created_at, updated_at";

const ORDER_BY = "ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END, sort_order ASC, created_at ASC";

// GET /api/fixed-expenses
export async function handleGetFixedExpenses(
  db: D1Database,
  user_id: string,
): Promise<Response> {
  const rows = await db
    .prepare(`SELECT ${SELECT_COLS} FROM fixed_expenses WHERE user_id = ? ${ORDER_BY}`)
    .bind(user_id)
    .all<FixedExpenseRow>();

  // 初回アクセス時にデフォルト5件をシード（INSERT OR IGNORE で冪等）
  if (rows.results.length === 0) {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const stmts = DEFAULTS.map((d) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO fixed_expenses (fixed_expense_id, user_id, name, icon_key, amount, is_default, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?)",
        )
        .bind(crypto.randomUUID(), user_id, d.name, d.icon_key, d.sort_order, now, now),
    );
    await db.batch(stmts);

    const seeded = await db
      .prepare(`SELECT ${SELECT_COLS} FROM fixed_expenses WHERE user_id = ? ${ORDER_BY}`)
      .bind(user_id)
      .all<FixedExpenseRow>();
    return jsonResponse(200, { ok: true, items: seeded.results });
  }

  return jsonResponse(200, { ok: true, items: rows.results });
}

// POST /api/fixed-expenses
export async function handlePostFixedExpense(
  db: D1Database,
  user_id: string,
  request: Request,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Invalid JSON body.");
  }

  if (!body || typeof body !== "object") return errorResponse(400, "Invalid body.");
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > 50) return errorResponse(400, "name must be 1–50 characters.");

  const icon_key = typeof b.icon_key === "string" ? b.icon_key : "custom";
  if (!VALID_ICON_KEYS.has(icon_key)) return errorResponse(400, "icon_key is invalid.");

  const rawAmount = b.amount;
  const amount =
    typeof rawAmount === "number" && Number.isInteger(rawAmount) && rawAmount >= 0
      ? rawAmount
      : typeof rawAmount === "string" && /^\d+$/.test(rawAmount)
      ? parseInt(rawAmount, 10)
      : null;
  if (amount === null) return errorResponse(400, "amount must be a non-negative integer.");

  // Determine next sort_order
  const maxSortResult = await db
    .prepare("SELECT MAX(sort_order) as max_sort FROM fixed_expenses WHERE user_id = ?")
    .bind(user_id)
    .first<{ max_sort: number | null }>();
  const nextSort = (maxSortResult?.max_sort ?? -1) + 1;

  const fixed_expense_id = crypto.randomUUID();
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  try {
    await db
      .prepare(
        "INSERT INTO fixed_expenses (fixed_expense_id, user_id, name, icon_key, amount, is_default, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)",
      )
      .bind(fixed_expense_id, user_id, name, icon_key, amount, nextSort, now, now)
      .run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) {
      return errorResponse(409, `「${name}」は既に存在します。`);
    }
    return errorResponse(500, "DB error.");
  }

  const created = await db
    .prepare(`SELECT ${SELECT_COLS} FROM fixed_expenses WHERE fixed_expense_id = ?`)
    .bind(fixed_expense_id)
    .first<FixedExpenseRow>();

  return jsonResponse(201, { ok: true, item: created });
}

// PATCH /api/fixed-expenses/:id
export async function handlePatchFixedExpense(
  db: D1Database,
  user_id: string,
  fixed_expense_id: string,
  request: Request,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Invalid JSON body.");
  }

  if (!body || typeof body !== "object") return errorResponse(400, "Invalid body.");
  const b = body as Record<string, unknown>;

  const existing = await db
    .prepare("SELECT name, icon_key, amount FROM fixed_expenses WHERE fixed_expense_id = ? AND user_id = ?")
    .bind(fixed_expense_id, user_id)
    .first<{ name: string; icon_key: string; amount: number }>();

  if (!existing) return errorResponse(404, "Fixed expense not found.");

  const newName = typeof b.name === "string" ? b.name.trim() : existing.name;
  if (!newName || newName.length > 50) return errorResponse(400, "name must be 1–50 characters.");

  const newIconKey = typeof b.icon_key === "string" ? b.icon_key : existing.icon_key;
  if (!VALID_ICON_KEYS.has(newIconKey)) return errorResponse(400, "icon_key is invalid.");

  let newAmount = existing.amount;
  if (b.amount !== undefined) {
    const raw = b.amount;
    const parsed =
      typeof raw === "number" && Number.isInteger(raw) && raw >= 0
        ? raw
        : typeof raw === "string" && /^\d+$/.test(raw)
        ? parseInt(raw, 10)
        : null;
    if (parsed === null) return errorResponse(400, "amount must be a non-negative integer.");
    newAmount = parsed;
  }

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  try {
    await db
      .prepare(
        "UPDATE fixed_expenses SET name = ?, icon_key = ?, amount = ?, updated_at = ? WHERE fixed_expense_id = ? AND user_id = ?",
      )
      .bind(newName, newIconKey, newAmount, now, fixed_expense_id, user_id)
      .run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) {
      return errorResponse(409, `「${newName}」は既に存在します。`);
    }
    return errorResponse(500, "DB error.");
  }

  const updated = await db
    .prepare(`SELECT ${SELECT_COLS} FROM fixed_expenses WHERE fixed_expense_id = ?`)
    .bind(fixed_expense_id)
    .first<FixedExpenseRow>();

  return jsonResponse(200, { ok: true, item: updated });
}

// DELETE /api/fixed-expenses/:id
export async function handleDeleteFixedExpense(
  db: D1Database,
  user_id: string,
  fixed_expense_id: string,
): Promise<Response> {
  const existing = await db
    .prepare("SELECT is_default FROM fixed_expenses WHERE fixed_expense_id = ? AND user_id = ?")
    .bind(fixed_expense_id, user_id)
    .first<{ is_default: number }>();

  if (!existing) return errorResponse(404, "Fixed expense not found.");
  if (existing.is_default === 1) return errorResponse(403, "デフォルト固定費は削除できません。");

  await db
    .prepare("DELETE FROM fixed_expenses WHERE fixed_expense_id = ? AND user_id = ?")
    .bind(fixed_expense_id, user_id)
    .run();

  return jsonResponse(200, { ok: true });
}
