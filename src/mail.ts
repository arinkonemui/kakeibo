/**
 * メール送信モジュール（Resend API）
 *
 * 環境変数:
 *   RESEND_API_KEY — Resend の API キー（wrangler secret put で設定）
 *   MAIL_FROM     — 送信元アドレス（例: "おさいふノート <noreply@arinkolab.com>"）
 */

export interface SendMailParams {
  to: string;
  subject: string;
  html: string;
}

export interface SendMailResult {
  ok: boolean;
  /** 送信成功時の Resend メール ID */
  id?: string;
  /** エラー時のメッセージ */
  error?: string;
  /** HTTP 429（レート制限）の場合 true */
  rateLimited?: boolean;
}

/**
 * Resend API 経由でメールを送信する。
 * RESEND_API_KEY が未設定の場合はコンソールログに出力（ローカル開発用フォールバック）。
 */
export async function sendMail(
  apiKey: string | undefined,
  from: string,
  params: SendMailParams,
): Promise<SendMailResult> {
  // ローカル開発用: API キー未設定時はコンソール出力で代替
  if (!apiKey) {
    console.log(`[Mail Fallback] To: ${params.to}, Subject: ${params.subject}`);
    console.log(`[Mail Fallback] Body: ${params.html}`);
    return { ok: true, id: "local-dev-fallback" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (res.status === 429) {
    console.error(`[Mail] RATE_LIMIT_EXCEEDED: to=${params.to}, subject=${params.subject}`);
    return {
      ok: false,
      error: "現在メール送信が混み合っています。しばらく経ってから再度お試しください。",
      rateLimited: true,
    };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[Mail] SEND_FAILED: status=${res.status}, to=${params.to}, body=${body}`);
    return { ok: false, error: "メール送信に失敗しました。しばらく経ってから再度お試しください。" };
  }

  const data = (await res.json()) as { id?: string };
  return { ok: true, id: data.id };
}
