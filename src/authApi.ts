/**
 * Authentication API handlers.
 * POST /api/auth/register — create a new user account
 * POST /api/auth/login    — authenticate and receive a token
 */

import { deriveUserId, hashPassword, issueToken, verifyPassword } from "./auth";
import { sendMail } from "./mail";

export interface AuthEnvWithSecret {
  DB: D1Database;
  AUTH_SECRET?: string;
}

interface UserRow {
  user_id: string;
  email: string;
  password_hash: string;
  username: string | null;
  email_verified: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** メールアドレス確認トークンを生成してDBに保存する（内部ヘルパー） */
async function createVerificationToken(db: D1Database, userId: string): Promise<string> {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // 24時間有効
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await db
    .prepare("DELETE FROM email_verification_tokens WHERE user_id = ?")
    .bind(userId)
    .run();
  await db
    .prepare("INSERT INTO email_verification_tokens (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, userId, expiresAt)
    .run();

  return token;
}

/** POST /api/auth/register */
export async function handleRegister(
  db: D1Database,
  secret: string,
  request: Request,
  resendApiKey?: string,
  mailFrom?: string,
  siteUrl?: string,
): Promise<Response> {
  let body: { email?: unknown; password?: unknown; username?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const username =
    typeof body.username === "string" && body.username.trim()
      ? body.username.trim()
      : null;

  // Validate
  if (!email || !EMAIL_RE.test(email)) {
    return json({ error: "有効なメールアドレスを入力してください" }, 400);
  }
  if (password.length < 8) {
    return json({ error: "パスワードは8文字以上で入力してください" }, 400);
  }

  const userId = await deriveUserId(email);
  const passwordHash = await hashPassword(password);

  try {
    await db
      .prepare(
        "INSERT INTO users (user_id, email, password_hash, username, email_verified) VALUES (?, ?, ?, ?, 0)",
      )
      .bind(userId, email, passwordHash, username)
      .run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("UNIQUE") || msg.includes("unique")) {
      // 未確認のまま再登録しようとしている場合は確認メールを再送
      const existing = await db
        .prepare("SELECT user_id, email_verified FROM users WHERE email = ?")
        .bind(email)
        .first<{ user_id: string; email_verified: number }>();
      if (existing && existing.email_verified === 0) {
        const token = await createVerificationToken(db, existing.user_id);
        await sendVerificationEmail(resendApiKey, mailFrom, siteUrl, email, token);
        return json({ pendingVerification: true }, 200);
      }
      return json({ error: "このメールアドレスは既に登録されています" }, 409);
    }
    throw e;
  }

  // デフォルトカテゴリを挿入
  const defaultCategories = ["食費", "交通費", "医療費", "雑費"];
  for (let i = 0; i < defaultCategories.length; i++) {
    const catId = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO categories (category_id, user_id, name, kind, is_active, sort_order) VALUES (?, ?, ?, 'both', 1, ?)",
      )
      .bind(catId, userId, defaultCategories[i], i + 1)
      .run();
  }

  // 確認メール送信
  const verifyToken = await createVerificationToken(db, userId);
  const mailResult = await sendVerificationEmail(resendApiKey, mailFrom, siteUrl, email, verifyToken);
  if (!mailResult.ok) {
    // メール送信失敗時はユーザーを削除してエラー
    await db.prepare("DELETE FROM users WHERE user_id = ?").bind(userId).run();
    return json({ error: mailResult.error }, mailResult.rateLimited ? 429 : 500);
  }

  return json({ pendingVerification: true }, 201);
}

/** 確認メール送信ヘルパー */
async function sendVerificationEmail(
  resendApiKey: string | undefined,
  mailFrom: string | undefined,
  siteUrl: string | undefined,
  email: string,
  token: string,
): Promise<{ ok: boolean; error?: string; rateLimited?: boolean }> {
  const base = siteUrl ?? "https://arinkolab.com/apps/kakeibo";
  const verifyUrl = `${base}/?verify=${token}`;
  const from = mailFrom ?? "おさいふノート <noreply@arinkolab.com>";

  return sendMail(resendApiKey, from, {
    to: email,
    subject: "【おさいふノート】メールアドレスの確認",
    html: [
      "<p>おさいふノートへのご登録ありがとうございます。</p>",
      "<p>以下のボタンをクリックして、メールアドレスを確認してください。</p>",
      `<p style="text-align:center;margin:24px 0;">`,
      `<a href="${verifyUrl}" style="background:#e07b00;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold;">メールアドレスを確認する</a>`,
      `</p>`,
      "<p>ボタンが押せない場合は、以下のURLをブラウザに貼り付けてください：</p>",
      `<p style="word-break:break-all;color:#555;">${verifyUrl}</p>`,
      "<p>このリンクは <strong>24時間</strong> 有効です。</p>",
      "<p>心当たりがない場合は、このメールを無視してください。</p>",
      "<hr>",
      "<p style=\"font-size:0.85em;color:#888;\">おさいふノート — arinkolab.com</p>",
    ].join("\n"),
  });
}

/** GET /api/auth/verify-email?token=TOKEN */
export async function handleVerifyEmail(
  db: D1Database,
  secret: string,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";

  if (!token) return json({ error: "トークンが指定されていません" }, 400);

  const row = await db
    .prepare("SELECT user_id, expires_at FROM email_verification_tokens WHERE token = ?")
    .bind(token)
    .first<{ user_id: string; expires_at: string }>();

  if (!row) return json({ error: "無効な確認リンクです" }, 400);

  if (new Date(row.expires_at) < new Date()) {
    await db.prepare("DELETE FROM email_verification_tokens WHERE token = ?").bind(token).run();
    return json({ error: "確認リンクの有効期限が切れています。再度登録をお試しください。" }, 400);
  }

  // 確認済みに更新
  await db
    .prepare("UPDATE users SET email_verified = 1 WHERE user_id = ?")
    .bind(row.user_id)
    .run();
  await db.prepare("DELETE FROM email_verification_tokens WHERE token = ?").bind(token).run();

  // 自動ログイン用トークンを発行
  const authToken = await issueToken(row.user_id, secret);
  const user = await db
    .prepare("SELECT email, username FROM users WHERE user_id = ?")
    .bind(row.user_id)
    .first<{ email: string; username: string | null }>();
  const displayName = user?.username ?? user?.email.split("@")[0] ?? "";

  return json({ ok: true, token: authToken, userId: row.user_id, displayName });
}

/** POST /api/auth/resend-verification */
export async function handleResendVerification(
  db: D1Database,
  request: Request,
  resendApiKey?: string,
  mailFrom?: string,
  siteUrl?: string,
): Promise<Response> {
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_RE.test(email)) {
    return json({ error: "有効なメールアドレスを入力してください" }, 400);
  }

  const user = await db
    .prepare("SELECT user_id, email_verified FROM users WHERE email = ?")
    .bind(email)
    .first<{ user_id: string; email_verified: number }>();

  // セキュリティ：存在しなくても同じレスポンス
  if (!user || user.email_verified === 1) {
    return json({ ok: true });
  }

  const token = await createVerificationToken(db, user.user_id);
  const result = await sendVerificationEmail(resendApiKey, mailFrom, siteUrl, email, token);
  if (!result.ok) {
    return json({ error: result.error }, result.rateLimited ? 429 : 500);
  }

  return json({ ok: true });
}

/** POST /api/auth/reset-request */
export async function handleResetRequest(
  db: D1Database,
  request: Request,
  resendApiKey?: string,
  mailFrom?: string,
): Promise<Response> {
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_RE.test(email)) {
    return json({ error: "有効なメールアドレスを入力してください" }, 400);
  }

  const user = await db
    .prepare("SELECT user_id FROM users WHERE email = ?")
    .bind(email)
    .first<{ user_id: string }>();

  if (!user) {
    // セキュリティ：ユーザーが存在しなくても同じレスポンス
    return json({ ok: true });
  }

  // トークン生成（32文字のランダム文字列）
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // 15分後に期限切れ
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  // 既存トークンを削除してから新規作成
  await db
    .prepare("DELETE FROM password_reset_tokens WHERE user_id = ?")
    .bind(user.user_id)
    .run();

  await db
    .prepare("INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, user.user_id, expiresAt)
    .run();

  // メール送信
  const from = mailFrom ?? "おさいふノート <noreply@arinkolab.com>";
  const result = await sendMail(resendApiKey, from, {
    to: email,
    subject: "【おさいふノート】パスワードリセット",
    html: [
      "<p>パスワードリセットのリクエストを受け付けました。</p>",
      "<p>以下のリセットコードを画面に入力してください。</p>",
      `<p style="font-size:1.5em;font-weight:bold;letter-spacing:0.1em;background:#f5f5f5;padding:12px;text-align:center;">${token}</p>`,
      "<p>このコードは <strong>15分間</strong> 有効です。</p>",
      "<p>心当たりがない場合は、このメールを無視してください。</p>",
      "<hr>",
      "<p style=\"font-size:0.85em;color:#888;\">おさいふノート — arinkolab.com</p>",
    ].join("\n"),
  });

  if (!result.ok) {
    // DB にトークンは保存済みだが、メール送信失敗 → トークンを削除してエラーを返す
    await db
      .prepare("DELETE FROM password_reset_tokens WHERE token = ?")
      .bind(token)
      .run();
    return json({ error: result.error }, result.rateLimited ? 429 : 500);
  }

  return json({ ok: true });
}

/** POST /api/auth/reset-password */
export async function handleResetPassword(
  db: D1Database,
  request: Request,
): Promise<Response> {
  let body: { token?: unknown; newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!token) return json({ error: "リセットコードが入力されていません" }, 400);
  if (newPassword.length < 8) {
    return json({ error: "パスワードは8文字以上で入力してください" }, 400);
  }

  const resetToken = await db
    .prepare("SELECT user_id, expires_at FROM password_reset_tokens WHERE token = ?")
    .bind(token)
    .first<{ user_id: string; expires_at: string }>();

  if (!resetToken) {
    return json({ error: "無効なリセットコードです" }, 400);
  }

  // 期限切れチェック
  if (new Date(resetToken.expires_at) < new Date()) {
    await db
      .prepare("DELETE FROM password_reset_tokens WHERE token = ?")
      .bind(token)
      .run();
    return json({ error: "リセットコードが期限切れです" }, 400);
  }

  // パスワード更新
  const passwordHash = await hashPassword(newPassword);
  await db
    .prepare("UPDATE users SET password_hash = ? WHERE user_id = ?")
    .bind(passwordHash, resetToken.user_id)
    .run();

  // トークン削除
  await db
    .prepare("DELETE FROM password_reset_tokens WHERE token = ?")
    .bind(token)
    .run();

  return json({ ok: true });
}

/** PATCH /api/auth/profile */
export async function handlePatchProfile(
  db: D1Database,
  userId: string,
  request: Request,
): Promise<Response> {
  let body: {
    username?: unknown;
    email?: unknown;
    currentPassword?: unknown;
    newPassword?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const user = await db
    .prepare("SELECT user_id, email, password_hash, username FROM users WHERE user_id = ?")
    .bind(userId)
    .first<UserRow>();
  if (!user) return json({ error: "ユーザーが見つかりません" }, 404);

  const setClauses: string[] = [];
  const params: (string | null)[] = [];

  // ── ユーザー名 ──
  if (body.username !== undefined) {
    const newUsername =
      typeof body.username === "string" && body.username.trim()
        ? body.username.trim()
        : null;
    if (newUsername !== null && newUsername.length > 50) {
      return json({ error: "ユーザー名は50文字以内で入力してください" }, 400);
    }
    setClauses.push("username = ?");
    params.push(newUsername);
  }

  // ── メールアドレス ──
  if (body.email !== undefined) {
    const newEmail =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!newEmail || !EMAIL_RE.test(newEmail)) {
      return json({ error: "有効なメールアドレスを入力してください" }, 400);
    }
    const curPw = typeof body.currentPassword === "string" ? body.currentPassword : "";
    if (!curPw) {
      return json({ error: "メールアドレスを変更するには現在のパスワードが必要です" }, 400);
    }
    if (!(await verifyPassword(curPw, user.password_hash))) {
      return json({ error: "現在のパスワードが正しくありません" }, 401);
    }
    const conflict = await db
      .prepare("SELECT user_id FROM users WHERE email = ?")
      .bind(newEmail)
      .first<{ user_id: string }>();
    if (conflict && conflict.user_id !== userId) {
      return json({ error: "このメールアドレスは既に使用されています" }, 409);
    }
    setClauses.push("email = ?");
    params.push(newEmail);
  }

  // ── パスワード ──
  if (body.newPassword !== undefined) {
    const newPw = typeof body.newPassword === "string" ? body.newPassword : "";
    if (newPw.length < 8) {
      return json({ error: "パスワードは8文字以上で入力してください" }, 400);
    }
    const curPw = typeof body.currentPassword === "string" ? body.currentPassword : "";
    if (!curPw) {
      return json({ error: "パスワードを変更するには現在のパスワードが必要です" }, 400);
    }
    if (!(await verifyPassword(curPw, user.password_hash))) {
      return json({ error: "現在のパスワードが正しくありません" }, 401);
    }
    setClauses.push("password_hash = ?");
    params.push(await hashPassword(newPw));
  }

  if (setClauses.length === 0) {
    return json({ error: "変更する項目がありません" }, 400);
  }

  params.push(userId);
  await db
    .prepare(`UPDATE users SET ${setClauses.join(", ")} WHERE user_id = ?`)
    .bind(...params)
    .run();

  const updated = await db
    .prepare("SELECT username, email FROM users WHERE user_id = ?")
    .bind(userId)
    .first<{ username: string | null; email: string }>();
  const displayName = updated?.username ?? updated?.email?.split("@")[0] ?? "";
  return json({ ok: true, displayName });
}

/** DELETE /api/auth/account — ユーザーアカウント物理削除 */
export async function handleDeleteAccount(
  db: D1Database,
  userId: string,
  request: Request,
): Promise<Response> {
  let body: { currentPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const curPw = typeof body.currentPassword === "string" ? body.currentPassword : "";
  if (!curPw) {
    return json({ error: "パスワードを入力してください" }, 400);
  }

  const user = await db
    .prepare("SELECT password_hash FROM users WHERE user_id = ?")
    .bind(userId)
    .first<{ password_hash: string }>();
  if (!user) return json({ error: "ユーザーが見つかりません" }, 404);

  if (!(await verifyPassword(curPw, user.password_hash))) {
    return json({ error: "パスワードが正しくありません" }, 401);
  }

  // 子テーブルから順に物理削除（FK 依存順）
  await db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").bind(userId).run();
  await db.prepare("DELETE FROM entries WHERE user_id = ?").bind(userId).run();
  await db.prepare("DELETE FROM daily_budgets WHERE user_id = ?").bind(userId).run();
  await db.prepare("DELETE FROM fixed_expenses WHERE user_id = ?").bind(userId).run();
  await db.prepare("DELETE FROM categories WHERE user_id = ?").bind(userId).run();
  await db.prepare("DELETE FROM months WHERE user_id = ?").bind(userId).run();
  await db.prepare("DELETE FROM users WHERE user_id = ?").bind(userId).run();

  return json({ ok: true });
}

/** POST /api/auth/login */
export async function handleLogin(
  db: D1Database,
  secret: string,
  request: Request,
): Promise<Response> {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return json({ error: "メールアドレスとパスワードを入力してください" }, 400);
  }

  const user = await db
    .prepare("SELECT user_id, email, password_hash, username, email_verified FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();

  // Timing-safe: always run verifyPassword even if user not found
  const dummyHash =
    "0000000000000000000000000000000000000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000";
  const passwordOk = await verifyPassword(password, user?.password_hash ?? dummyHash);

  if (!user || !passwordOk) {
    return json({ error: "メールアドレスまたはパスワードが正しくありません" }, 401);
  }

  // メールアドレス未確認チェック
  if (user.email_verified === 0) {
    return json({ error: "メールアドレスの確認が完了していません。登録時に送信した確認メールをご確認ください。", unverified: true }, 403);
  }

  const token = await issueToken(user.user_id, secret);
  const displayName = user.username ?? email.split("@")[0]!;

  return json({ token, userId: user.user_id, displayName }, 200);
}
