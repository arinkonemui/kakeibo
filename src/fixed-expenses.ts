/**
 * Fixed expenses CRUD handlers for /api/fixed-expenses
 * Stored per (user_id, month_key).
 * On first GET for a month: copy from prev month → fallback to 5 defaults.
 */

const VALID_ICON_KEYS = new Set([
  "home", "flame", "faucet", "bulb", "phone", "smartphone", "train", "monitor", "clothes", "cosmetics", "furniture", "car", "building", "food", "cafe",
  "video", "book", "music", "education", "game", "custom"
]);

const VALID_ENTRY_TYPES = new Set(["expense", "income"]);

const DEFAULTS = [
  { name: "家賃",   icon_key: "home",   sort_order: 0 },
  { name: "ガス",   icon_key: "flame",  sort_order: 1 },
  { name: "水道",   icon_key: "faucet", sort_order: 2 },
  { name: "電気",   icon_key: "bulb",   sort_order: 3 },
  { name: "スマホ", icon_key: "smartphone", sort_order: 4 },
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
  month_key: string;
  entry_type: string;
  name: string;
  icon_key: string;
  amount: number;
  is_default: number;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLS =
  "fixed_expense_id, user_id, month_key, entry_type, name, icon_key, amount, is_default, sort_order, created_at, updated_at";

const ORDER_BY =
  "ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END, sort_order ASC, created_at ASC";

/** YYYY-MM → 1つ前の月キー（例: "2026-01" → "2025-12"） */
function prevMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number) as [number, number];
  const d = new Date(y, m - 2, 1); // month は 0-indexed
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// GET /api/fixed-expenses?month_key=YYYY-MM
export async function handleGetFixedExpenses(
  db: D1Database,
  user_id: string,
  month_key: string,
): Promise<Response> {
  if (!/^\d{4}-\d{2}$/.test(month_key)) {
    return errorResponse(400, "month_key must be YYYY-MM format.");
  }

  const rows = await db
    .prepare(
      `SELECT ${SELECT_COLS} FROM fixed_expenses WHERE user_id = ? AND month_key = ? ${ORDER_BY}`,
    )
    .bind(user_id, month_key)
    .all<FixedExpenseRow>();

  if (rows.results.length > 0) {
    return jsonResponse(200, { ok: true, items: rows.results });
  }

  // months レコードが存在する月は「意図的にクリア済み」とみなしシードしない
  const monthsRecord = await db
    .prepare("SELECT month_key FROM months WHERE user_id = ? AND month_key = ?")
    .bind(user_id, month_key)
    .first<{ month_key: string }>();
  if (monthsRecord) {
    return jsonResponse(200, { ok: true, items: [] });
  }

  // 初回アクセス — 前月からコピーを試みる
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const prev = prevMonthKey(month_key);

  const prevRows = await db
    .prepare(
      `SELECT ${SELECT_COLS} FROM fixed_expenses WHERE user_id = ? AND month_key = ? ${ORDER_BY}`,
    )
    .bind(user_id, prev)
    .all<FixedExpenseRow>();

  if (prevRows.results.length > 0) {
    // 前月データをコピー（金額も引き継ぎ）
    const stmts = prevRows.results.map((r) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO fixed_expenses (fixed_expense_id, user_id, month_key, entry_type, name, icon_key, amount, is_default, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          crypto.randomUUID(),
          user_id,
          month_key,
          r.entry_type,
          r.name,
          r.icon_key,
          r.amount,
          r.is_default,
          r.sort_order,
          now,
          now,
        ),
    );
    await db.batch(stmts);
  } else {
    // 前月もなければデフォルト5件をシード（expense のみ、income はデフォルトなし）
    const stmts = DEFAULTS.map((d) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO fixed_expenses (fixed_expense_id, user_id, month_key, entry_type, name, icon_key, amount, is_default, sort_order, created_at, updated_at) VALUES (?, ?, ?, 'expense', ?, ?, 0, 1, ?, ?, ?)",
        )
        .bind(crypto.randomUUID(), user_id, month_key, d.name, d.icon_key, d.sort_order, now, now),
    );
    await db.batch(stmts);
  }

  const seeded = await db
    .prepare(
      `SELECT ${SELECT_COLS} FROM fixed_expenses WHERE user_id = ? AND month_key = ? ${ORDER_BY}`,
    )
    .bind(user_id, month_key)
    .all<FixedExpenseRow>();
  return jsonResponse(200, { ok: true, items: seeded.results });
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

  const month_key = typeof b.month_key === "string" ? b.month_key : "";
  if (!/^\d{4}-\d{2}$/.test(month_key)) {
    return errorResponse(400, "month_key must be YYYY-MM format.");
  }

  const entry_type = typeof b.entry_type === "string" ? b.entry_type : "expense";
  if (!VALID_ENTRY_TYPES.has(entry_type)) return errorResponse(400, "entry_type must be 'expense' or 'income'.");

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

  // Determine next sort_order for this month+type
  const maxSortResult = await db
    .prepare(
      "SELECT MAX(sort_order) as max_sort FROM fixed_expenses WHERE user_id = ? AND month_key = ? AND entry_type = ?",
    )
    .bind(user_id, month_key, entry_type)
    .first<{ max_sort: number | null }>();
  const nextSort = (maxSortResult?.max_sort ?? -1) + 1;

  const fixed_expense_id = crypto.randomUUID();
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  try {
    await db
      .prepare(
        "INSERT INTO fixed_expenses (fixed_expense_id, user_id, month_key, entry_type, name, icon_key, amount, is_default, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
      )
      .bind(fixed_expense_id, user_id, month_key, entry_type, name, icon_key, amount, nextSort, now, now)
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
    .prepare(
      "SELECT name, icon_key, amount FROM fixed_expenses WHERE fixed_expense_id = ? AND user_id = ?",
    )
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

// POST /api/fixed-expenses/apply-to-future
// Body: { month_key: string }
// ソース月の固定費・収入を、それより新しい月（既存レコードがある月）に一括反映する。
// - 同名+同種別アイテム → amount / icon_key を上書き
// - ソース月にあるが未来月にないアイテム → INSERT OR IGNORE で追加
// - ソース月にないが未来月にあるアイテム → 手を加えない（未来月固有の追加を尊重）
export async function handleApplyFixedExpensesToFuture(
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

  const month_key = typeof b.month_key === "string" ? b.month_key : "";
  if (!/^\d{4}-\d{2}$/.test(month_key)) {
    return errorResponse(400, "month_key must be YYYY-MM format.");
  }

  // entry_type フィルタ（省略時は全件）
  const entryTypeFilter =
    typeof b.entry_type === "string" && VALID_ENTRY_TYPES.has(b.entry_type)
      ? (b.entry_type as string)
      : null;

  // ソース月のアイテムを取得
  const sourceRows = entryTypeFilter
    ? await db
        .prepare(
          `SELECT ${SELECT_COLS} FROM fixed_expenses WHERE user_id = ? AND month_key = ? AND entry_type = ? ${ORDER_BY}`,
        )
        .bind(user_id, month_key, entryTypeFilter)
        .all<FixedExpenseRow>()
    : await db
        .prepare(
          `SELECT ${SELECT_COLS} FROM fixed_expenses WHERE user_id = ? AND month_key = ? ${ORDER_BY}`,
        )
        .bind(user_id, month_key)
        .all<FixedExpenseRow>();

  if (sourceRows.results.length === 0) {
    return jsonResponse(200, { ok: true, applied_months: 0 });
  }

  // 未来月一覧を取得（ソース月より大きい month_key で既にレコードが存在する月）
  const futureRows = await db
    .prepare(
      "SELECT DISTINCT month_key FROM fixed_expenses WHERE user_id = ? AND month_key > ? ORDER BY month_key",
    )
    .bind(user_id, month_key)
    .all<{ month_key: string }>();

  const futureMonths = futureRows.results.map((r) => r.month_key);
  if (futureMonths.length === 0) {
    return jsonResponse(200, { ok: true, applied_months: 0 });
  }

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const sourceItems = sourceRows.results;

  // 各未来月 × 各ソースアイテムに対して UPDATE + INSERT OR IGNORE を積む
  const allStmts: D1PreparedStatement[] = [];
  for (const futureMonth of futureMonths) {
    for (const src of sourceItems) {
      // 既存アイテムの amount / icon_key を更新
      allStmts.push(
        db
          .prepare(
            "UPDATE fixed_expenses SET amount = ?, icon_key = ?, updated_at = ? WHERE user_id = ? AND month_key = ? AND entry_type = ? AND name = ?",
          )
          .bind(src.amount, src.icon_key, now, user_id, futureMonth, src.entry_type, src.name),
      );
      // 未来月にまだ存在しないアイテムを追加
      allStmts.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO fixed_expenses (fixed_expense_id, user_id, month_key, entry_type, name, icon_key, amount, is_default, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(
            crypto.randomUUID(),
            user_id,
            futureMonth,
            src.entry_type,
            src.name,
            src.icon_key,
            src.amount,
            src.is_default,
            src.sort_order,
            now,
            now,
          ),
      );
    }
  }

  // D1 batch は 100 ステートメント制限があるためチャンク処理
  const CHUNK = 100;
  for (let i = 0; i < allStmts.length; i += CHUNK) {
    await db.batch(allStmts.slice(i, i + CHUNK));
  }

  return jsonResponse(200, { ok: true, applied_months: futureMonths.length });
}

// DELETE /api/fixed-expenses/:id
export async function handleDeleteFixedExpense(
  db: D1Database,
  user_id: string,
  fixed_expense_id: string,
): Promise<Response> {
  const existing = await db
    .prepare(
      "SELECT fixed_expense_id FROM fixed_expenses WHERE fixed_expense_id = ? AND user_id = ?",
    )
    .bind(fixed_expense_id, user_id)
    .first<{ fixed_expense_id: string }>();

  if (!existing) return errorResponse(404, "Fixed expense not found.");

  await db
    .prepare("DELETE FROM fixed_expenses WHERE fixed_expense_id = ? AND user_id = ?")
    .bind(fixed_expense_id, user_id)
    .run();

  return jsonResponse(200, { ok: true });
}
