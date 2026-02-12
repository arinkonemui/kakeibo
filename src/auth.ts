/**
 * Authentication helper.
 *
 * Two modes:
 * A) Dev mode  — enabled when env.DEV_MODE is truthy.
 *    Reads user id from `X-Debug-User` header.
 *    MUST NOT be enabled in production.
 *
 * B) Prod mode — verifies HMAC-SHA256 signed token from
 *    `Authorization: Bearer <token>`.
 *    Token format: <base64url(payload)>.<base64url(signature)>
 *    Payload JSON: { "sub": "<user_id>", "exp": <unix_seconds> }
 *    Secret key is read from env.AUTH_SECRET.
 *
 * Canonical user_id format:
 *    `u_` + 32 hex chars (SHA-256 of identifier, first 16 bytes)
 *    Example: u_a1b2c3d4e5f60718293a4b5c6d7e8f90
 *    Total length: 34 chars, fixed.
 */

export interface AuthEnv {
  DEV_MODE?: string;
  AUTH_SECRET?: string;
}

// --- Canonical user_id format ---
// u_ + 32 lowercase hex chars (34 chars total)
const USER_ID_RE = /^u_[0-9a-f]{32}$/;

export function isValidUserId(id: string): boolean {
  return USER_ID_RE.test(id);
}

export class AuthError {
  constructor(
    public readonly status: number,
    public readonly message: string,
  ) {}
}

/**
 * Derives a trusted user_id from the request.
 * Throws AuthError on failure (caller converts to HTTP response).
 */
export async function getAuthUserId(
  request: Request,
  env: AuthEnv,
): Promise<string> {
  // --- A) Dev mode ---
  if (env.DEV_MODE) {
    const debugUser = request.headers.get("X-Debug-User");
    if (!debugUser || debugUser.trim() === "") {
      throw new AuthError(401, "Unauthorized");
    }
    const id = debugUser.trim();
    if (!isValidUserId(id)) {
      throw new AuthError(400, "Bad Request");
    }
    return id;
  }

  // --- B) Prod mode: HMAC token ---
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AuthError(401, "Unauthorized");
  }

  const token = authHeader.slice(7); // strip "Bearer "
  if (!token) {
    throw new AuthError(401, "Unauthorized");
  }

  const secret = env.AUTH_SECRET;
  if (!secret) {
    // Server misconfiguration — do not leak details
    throw new AuthError(401, "Unauthorized");
  }

  return verifyToken(token, secret);
}

// --- Token helpers ---

async function verifyToken(token: string, secret: string): Promise<string> {
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) {
    throw new AuthError(400, "Bad Request");
  }

  const payloadB64 = token.slice(0, dotIndex);
  const signatureB64 = token.slice(dotIndex + 1);

  // Verify signature
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const signatureBytes = base64urlDecode(signatureB64);
  const payloadBytes = new TextEncoder().encode(payloadB64);

  const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, payloadBytes);
  if (!valid) {
    throw new AuthError(401, "Unauthorized");
  }

  // Parse payload
  let payload: { sub?: string; exp?: number };
  try {
    const decoded = new TextDecoder().decode(base64urlDecode(payloadB64));
    payload = JSON.parse(decoded);
  } catch {
    throw new AuthError(400, "Bad Request");
  }

  // Check expiry
  if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AuthError(401, "Unauthorized");
  }

  // Extract and validate user_id
  if (!payload.sub || typeof payload.sub !== "string" || !isValidUserId(payload.sub)) {
    throw new AuthError(400, "Bad Request");
  }

  return payload.sub;
}

function base64urlDecode(s: string): Uint8Array {
  // base64url -> base64
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (base64.length % 4)) % 4;
  const padded = base64 + "=".repeat(pad);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
