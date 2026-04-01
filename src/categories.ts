/**
 * Category CRUD handlers for /api/categories
 * DELETE = soft-delete (is_active=0) to preserve entry FK integrity.
 */

const VALID_KINDS = new Set(["expense", "income", "both"]);

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

// POST /api/categories
export async function handlePostCategory(
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

  const kind = typeof b.kind === "string" ? b.kind : "expense";
  if (!VALID_KINDS.has(kind)) return errorResponse(400, "kind must be expense, income, or both.");

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const category_id = crypto.randomUUID();

  // Determine next sort_order
  const maxSortResult = await db
    .prepare("SELECT MAX(sort_order) as max_sort FROM categories WHERE user_id = ?")
    .bind(user_id)
    .first<{ max_sort: number | null }>();
  const nextSort = (maxSortResult?.max_sort ?? -1) + 1;

  try {
    await db
      .prepare(
        "INSERT INTO categories (category_id, user_id, name, kind, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)",
      )
      .bind(category_id, user_id, name, kind, nextSort, now, now)
      .run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) {
      return errorResponse(409, `カテゴリ名「${name}」は既に存在します。`);
    }
    return errorResponse(500, "DB error.");
  }

  const created = await db
    .prepare("SELECT category_id, user_id, name, kind, is_active, sort_order, created_at, updated_at FROM categories WHERE category_id = ?")
    .bind(category_id)
    .first<CategoryRow>();

  return jsonResponse(201, { ok: true, category: created });
}

// PATCH /api/categories/:category_id
export async function handlePatchCategory(
  db: D1Database,
  user_id: string,
  category_id: string,
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

  // Fetch existing to verify ownership
  const existing = await db
    .prepare("SELECT category_id, name, kind, is_active, sort_order FROM categories WHERE category_id = ? AND user_id = ?")
    .bind(category_id, user_id)
    .first<{ category_id: string; name: string; kind: string; is_active: number; sort_order: number | null }>();

  if (!existing) return errorResponse(404, "Category not found.");

  const newName = typeof b.name === "string" ? b.name.trim() : existing.name;
  if (!newName || newName.length > 50) return errorResponse(400, "name must be 1–50 characters.");

  const newKind = typeof b.kind === "string" ? b.kind : existing.kind;
  if (!VALID_KINDS.has(newKind)) return errorResponse(400, "kind must be expense, income, or both.");

  const newIsActive = typeof b.is_active === "number" ? b.is_active : existing.is_active;
  const newSortOrder = typeof b.sort_order === "number" ? b.sort_order : existing.sort_order;

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  try {
    await db
      .prepare(
        "UPDATE categories SET name = ?, kind = ?, is_active = ?, sort_order = ?, updated_at = ? WHERE category_id = ? AND user_id = ?",
      )
      .bind(newName, newKind, newIsActive, newSortOrder, now, category_id, user_id)
      .run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) {
      return errorResponse(409, `カテゴリ名「${newName}」は既に存在します。`);
    }
    return errorResponse(500, "DB error.");
  }

  const updated = await db
    .prepare("SELECT category_id, user_id, name, kind, is_active, sort_order, created_at, updated_at FROM categories WHERE category_id = ?")
    .bind(category_id)
    .first<CategoryRow>();

  return jsonResponse(200, { ok: true, category: updated });
}

// DELETE /api/categories/:category_id (soft-delete: is_active=0 + delete related entries)
export async function handleDeleteCategory(
  db: D1Database,
  user_id: string,
  category_id: string,
): Promise<Response> {
  const existing = await db
    .prepare("SELECT category_id FROM categories WHERE category_id = ? AND user_id = ?")
    .bind(category_id, user_id)
    .first<{ category_id: string }>();

  if (!existing) return errorResponse(404, "Category not found.");

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  // カテゴリのソフトデリート + 該当エントリの削除をバッチ実行
  const results = await db.batch([
    db
      .prepare("DELETE FROM entries WHERE category_id = ? AND user_id = ?")
      .bind(category_id, user_id),
    db
      .prepare("UPDATE categories SET is_active = 0, updated_at = ? WHERE category_id = ? AND user_id = ?")
      .bind(now, category_id, user_id),
  ]);

  const deletedEntries = results[0]?.meta?.changes ?? 0;

  return jsonResponse(200, { ok: true, deleted_entries: deletedEntries });
}
