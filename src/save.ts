/**
 * POST /api/monthly — diff-based save with optimistic locking.
 *
 * Transaction approach: D1 batch (all statements execute atomically).
 * Category validation: single SELECT to fetch valid category_ids, validate in-memory.
 * Entry ID generation: crypto.randomUUID() for create_entries without entry_id.
 */

// --- Constants ---

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const VALID_TYPES = new Set(["expense", "income"]);
const VALID_PAYMENT_METHODS = new Set(["現金", "クレカ", "銀行引落", "QR", "その他"]);

// --- Request types ---

interface SaveRequest {
  month_key: string;
  expected_version: number;
  ops: SaveOps;
}

interface SaveOps {
  create_entries?: CreateEntry[];
  update_entries?: UpdateEntry[];
  delete_entry_ids?: string[];
  upsert_daily_budgets?: UpsertDailyBudget[];
  delete_daily_budget_dates?: string[];
}

interface CreateEntry {
  entry_id?: string;
  date: string;
  type: string;
  amount: number;
  category_id: string;
  memo?: string | null;
  payment_method?: string | null;
}

interface UpdateEntry {
  entry_id: string;
  date: string;
  type: string;
  amount: number;
  category_id: string;
  memo?: string | null;
  payment_method?: string | null;
}

interface UpsertDailyBudget {
  date: string;
  daily_budget_override: number;
}

// --- Response types ---

interface SaveResponse {
  ok: true;
  month_key: string;
  new_version: number;
  applied: {
    created_entries: number;
    updated_entries: number;
    deleted_entries: number;
    upserted_daily_budgets: number;
    deleted_daily_budgets: number;
  };
}

// --- Editable month range ---

function getEditableMonthKeys(): Set<string> {
  const now = new Date();
  const keys = new Set<string>();
  for (let i = 0; i < 6; i++) {
    const y = now.getFullYear();
    const m = now.getMonth() + 1; // 1-based
    // Subtract i months
    const date = new Date(y, m - 1 - i, 1);
    const mk = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    keys.add(mk);
  }
  return keys;
}

function dateMatchesMonthKey(date: string, monthKey: string): boolean {
  return date.startsWith(monthKey + "-");
}

// --- Validation ---

function validateBody(body: unknown): SaveRequest | string {
  if (!body || typeof body !== "object") return "Invalid request body.";
  const b = body as Record<string, unknown>;

  // month_key
  if (typeof b.month_key !== "string" || !MONTH_KEY_RE.test(b.month_key)) {
    return "month_key must be in YYYY-MM format.";
  }

  // expected_version
  if (typeof b.expected_version !== "number" || !Number.isInteger(b.expected_version) || b.expected_version < 0) {
    return "expected_version must be a non-negative integer.";
  }

  // ops
  if (!b.ops || typeof b.ops !== "object") {
    return "ops is required.";
  }

  return {
    month_key: b.month_key,
    expected_version: b.expected_version,
    ops: b.ops as SaveOps,
  };
}

function validateCreateEntry(e: unknown, monthKey: string): CreateEntry | string {
  if (!e || typeof e !== "object") return "Invalid entry object.";
  const o = e as Record<string, unknown>;

  if (o.entry_id !== undefined && o.entry_id !== null && typeof o.entry_id !== "string") {
    return "entry_id must be a string if provided.";
  }
  if (typeof o.date !== "string" || !DATE_RE.test(o.date)) return "date must be YYYY-MM-DD.";
  if (!dateMatchesMonthKey(o.date, monthKey)) return `date ${o.date} does not match month_key ${monthKey}.`;
  if (typeof o.type !== "string" || !VALID_TYPES.has(o.type)) return "type must be 'expense' or 'income'.";
  if (typeof o.amount !== "number" || !Number.isInteger(o.amount) || o.amount <= 0) return "amount must be a positive integer.";
  if (typeof o.category_id !== "string" || o.category_id === "") return "category_id is required.";

  // payment_method
  if (o.payment_method !== undefined && o.payment_method !== null) {
    if (typeof o.payment_method !== "string" || !VALID_PAYMENT_METHODS.has(o.payment_method)) {
      return "Invalid payment_method.";
    }
  }

  return {
    entry_id: typeof o.entry_id === "string" ? o.entry_id : undefined,
    date: o.date,
    type: o.type,
    amount: o.amount,
    category_id: o.category_id,
    memo: typeof o.memo === "string" ? o.memo : null,
    payment_method: typeof o.payment_method === "string" ? o.payment_method : null,
  };
}

function validateUpdateEntry(e: unknown, monthKey: string): UpdateEntry | string {
  if (!e || typeof e !== "object") return "Invalid entry object.";
  const o = e as Record<string, unknown>;

  if (typeof o.entry_id !== "string" || o.entry_id === "") return "entry_id is required for update.";

  const base = validateCreateEntry({ ...o }, monthKey);
  if (typeof base === "string") return base;

  return { ...base, entry_id: o.entry_id as string };
}

function validateUpsertDailyBudget(d: unknown, monthKey: string): UpsertDailyBudget | string {
  if (!d || typeof d !== "object") return "Invalid daily_budget object.";
  const o = d as Record<string, unknown>;

  if (typeof o.date !== "string" || !DATE_RE.test(o.date)) return "date must be YYYY-MM-DD.";
  if (!dateMatchesMonthKey(o.date, monthKey)) return `date ${o.date} does not match month_key ${monthKey}.`;
  if (typeof o.daily_budget_override !== "number" || !Number.isInteger(o.daily_budget_override) || o.daily_budget_override < 0) {
    return "daily_budget_override must be a non-negative integer.";
  }

  return { date: o.date, daily_budget_override: o.daily_budget_override };
}

// --- Main handler ---

export async function handlePostMonthly(
  db: D1Database,
  user_id: string,
  request: Request,
): Promise<Response> {
  // Parse body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse(400, "Invalid JSON body.");
  }

  const validated = validateBody(rawBody);
  if (typeof validated === "string") return errorResponse(400, validated);

  const { month_key, expected_version, ops } = validated;

  // Check editable range
  const editable = getEditableMonthKeys();
  if (!editable.has(month_key)) {
    return errorResponse(403, "This month is read-only.");
  }

  // Validate ops arrays
  const createEntries: CreateEntry[] = [];
  if (ops.create_entries) {
    if (!Array.isArray(ops.create_entries)) return errorResponse(400, "create_entries must be an array.");
    for (const e of ops.create_entries) {
      const v = validateCreateEntry(e, month_key);
      if (typeof v === "string") return errorResponse(400, v);
      v.entry_id = v.entry_id || crypto.randomUUID();
      createEntries.push(v);
    }
  }

  const updateEntries: UpdateEntry[] = [];
  if (ops.update_entries) {
    if (!Array.isArray(ops.update_entries)) return errorResponse(400, "update_entries must be an array.");
    for (const e of ops.update_entries) {
      const v = validateUpdateEntry(e, month_key);
      if (typeof v === "string") return errorResponse(400, v);
      updateEntries.push(v);
    }
  }

  const deleteEntryIds: string[] = [];
  if (ops.delete_entry_ids) {
    if (!Array.isArray(ops.delete_entry_ids)) return errorResponse(400, "delete_entry_ids must be an array.");
    for (const id of ops.delete_entry_ids) {
      if (typeof id !== "string" || id === "") return errorResponse(400, "delete_entry_ids must contain non-empty strings.");
      deleteEntryIds.push(id);
    }
  }

  const upsertDailyBudgets: UpsertDailyBudget[] = [];
  if (ops.upsert_daily_budgets) {
    if (!Array.isArray(ops.upsert_daily_budgets)) return errorResponse(400, "upsert_daily_budgets must be an array.");
    for (const d of ops.upsert_daily_budgets) {
      const v = validateUpsertDailyBudget(d, month_key);
      if (typeof v === "string") return errorResponse(400, v);
      upsertDailyBudgets.push(v);
    }
  }

  const deleteDailyBudgetDates: string[] = [];
  if (ops.delete_daily_budget_dates) {
    if (!Array.isArray(ops.delete_daily_budget_dates)) return errorResponse(400, "delete_daily_budget_dates must be an array.");
    for (const d of ops.delete_daily_budget_dates) {
      if (typeof d !== "string" || !DATE_RE.test(d)) return errorResponse(400, "delete_daily_budget_dates must contain YYYY-MM-DD strings.");
      if (!dateMatchesMonthKey(d, month_key)) return errorResponse(400, `date ${d} does not match month_key ${month_key}.`);
      deleteDailyBudgetDates.push(d);
    }
  }

  // No-op check: if all ops are empty, still need version bump? No — spec says "no changes = no DB queries"
  const totalOps = createEntries.length + updateEntries.length + deleteEntryIds.length
    + upsertDailyBudgets.length + deleteDailyBudgetDates.length;
  if (totalOps === 0) {
    return jsonResponse(200, {
      ok: true,
      month_key,
      new_version: expected_version,
      applied: { created_entries: 0, updated_entries: 0, deleted_entries: 0, upserted_daily_budgets: 0, deleted_daily_budgets: 0 },
    });
  }

  // Validate category_ids: single query to fetch all user category_ids
  const allCategoryIds = new Set<string>();
  for (const e of createEntries) allCategoryIds.add(e.category_id);
  for (const e of updateEntries) allCategoryIds.add(e.category_id);

  if (allCategoryIds.size > 0) {
    const catResult = await db
      .prepare("SELECT category_id FROM categories WHERE user_id = ?")
      .bind(user_id)
      .all<{ category_id: string }>();
    const validCatIds = new Set(catResult.results.map((r) => r.category_id));
    for (const cid of allCategoryIds) {
      if (!validCatIds.has(cid)) {
        return errorResponse(400, `Invalid category_id: ${cid}`);
      }
    }
  }

  // --- Build batch statements ---
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const stmts: D1PreparedStatement[] = [];

  // 1. Ensure months row exists (INSERT OR IGNORE)
  stmts.push(
    db.prepare(
      "INSERT OR IGNORE INTO months (user_id, month_key, version, cutoff_type, updated_at) VALUES (?, ?, 0, 'calendar', ?)",
    ).bind(user_id, month_key, now),
  );

  // 2. Version check + bump (UPDATE ... WHERE version = expected)
  //    This is the optimistic lock: if 0 rows affected, version mismatch.
  stmts.push(
    db.prepare(
      "UPDATE months SET version = version + 1, updated_at = ? WHERE user_id = ? AND month_key = ? AND version = ?",
    ).bind(now, user_id, month_key, expected_version),
  );

  // 3. Create entries
  for (const e of createEntries) {
    stmts.push(
      db.prepare(
        "INSERT INTO entries (entry_id, user_id, month_key, date, type, amount, category_id, memo, payment_method, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(e.entry_id!, user_id, month_key, e.date, e.type, e.amount, e.category_id, e.memo, e.payment_method, now, now),
    );
  }

  // 4. Update entries
  for (const e of updateEntries) {
    stmts.push(
      db.prepare(
        "UPDATE entries SET date = ?, type = ?, amount = ?, category_id = ?, memo = ?, payment_method = ?, updated_at = ? WHERE entry_id = ? AND user_id = ? AND month_key = ?",
      ).bind(e.date, e.type, e.amount, e.category_id, e.memo, e.payment_method, now, e.entry_id, user_id, month_key),
    );
  }

  // 5. Delete entries
  for (const id of deleteEntryIds) {
    stmts.push(
      db.prepare(
        "DELETE FROM entries WHERE entry_id = ? AND user_id = ? AND month_key = ?",
      ).bind(id, user_id, month_key),
    );
  }

  // 6. Upsert daily budgets
  for (const d of upsertDailyBudgets) {
    stmts.push(
      db.prepare(
        "INSERT INTO daily_budgets (user_id, month_key, date, daily_budget_override, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, month_key, date) DO UPDATE SET daily_budget_override = excluded.daily_budget_override, updated_at = excluded.updated_at",
      ).bind(user_id, month_key, d.date, d.daily_budget_override, now, now),
    );
  }

  // 7. Delete daily budgets
  for (const d of deleteDailyBudgetDates) {
    stmts.push(
      db.prepare(
        "DELETE FROM daily_budgets WHERE user_id = ? AND month_key = ? AND date = ?",
      ).bind(user_id, month_key, d),
    );
  }

  // Execute batch (atomic)
  const results = await db.batch(stmts);

  // Check optimistic lock result (index 1 = version bump UPDATE)
  const versionBumpResult = results[1];
  if (!versionBumpResult.meta.changes || versionBumpResult.meta.changes === 0) {
    // Version mismatch — conflict
    return jsonResponse(409, {
      error: "Conflict",
      message: "Please fetch latest and re-apply changes.",
    });
  }

  const response: SaveResponse = {
    ok: true,
    month_key,
    new_version: expected_version + 1,
    applied: {
      created_entries: createEntries.length,
      updated_entries: updateEntries.length,
      deleted_entries: deleteEntryIds.length,
      upserted_daily_budgets: upsertDailyBudgets.length,
      deleted_daily_budgets: deleteDailyBudgetDates.length,
    },
  };

  return jsonResponse(200, response);
}

// --- Helpers ---

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
