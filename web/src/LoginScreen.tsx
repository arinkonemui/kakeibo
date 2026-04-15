import { useState } from "react";
import { authLogin, authRegister, resendVerification } from "./api";
import { PasswordResetModal } from "./PasswordResetModal";

type Mode = "login" | "register";

interface Props {
  onLogin: (token: string, userId: string, displayName: string) => void;
}

export function LoginScreen({ onLogin }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [resetOpen, setResetOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // 確認メール送信済み状態
  const [pendingVerification, setPendingVerification] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  // 未確認エラー（ログイン時）
  const [unverified, setUnverified] = useState(false);
  // 再送信状態
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setUnverified(false);
    setResendMsg(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUnverified(false);
    setLoading(true);

    try {
      if (mode === "register") {
        const result = await authRegister(email, password, username || undefined);
        if ("error" in result) {
          setError(result.error);
        } else if ("pendingVerification" in result) {
          setPendingEmail(email);
          setPendingVerification(true);
        } else {
          onLogin(result.token, result.userId, result.displayName);
        }
      } else {
        const result = await authLogin(email, password);
        if ("error" in result) {
          setError(result.error);
          if (result.unverified) setUnverified(true);
        } else {
          onLogin(result.token, result.userId, result.displayName);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend(targetEmail: string) {
    setResendMsg(null);
    setResendLoading(true);
    const res = await resendVerification(targetEmail);
    setResendLoading(false);
    if ("error" in res) {
      setResendMsg({ ok: false, text: res.error });
    } else {
      setResendMsg({ ok: true, text: "確認メールを再送しました。メールをご確認ください。" });
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-brand">おさいふノート</h1>
        <p className="login-catchphrase">
          1か月を一目で見渡す。<br />見開きカレンダー型のシンプル家計簿。
        </p>

        {/* 確認メール送信済み — 新規登録画面内に表示 */}
        {pendingVerification ? (
          <div className="verify-pending">
            <div className="verify-pending-icon">✉️</div>
            <h2>確認メールを送信しました</h2>
            <p>
              <strong>{pendingEmail}</strong> に確認メールをお送りしました。<br />
              メール内のリンクをクリックしてメールアドレスを確認してください。
            </p>
            <p className="verify-pending-note">
              メールが届かない場合は迷惑メールフォルダもご確認ください。
            </p>
            {resendMsg && (
              <p className={resendMsg.ok ? "profile-msg-ok" : "profile-msg-err"}>
                {resendMsg.text}
              </p>
            )}
            <div className="verify-pending-actions">
              <button
                className="btn-secondary"
                onClick={() => handleResend(pendingEmail)}
                disabled={resendLoading}
              >
                {resendLoading ? "送信中..." : "確認メールを再送する"}
              </button>
              <button
                className="btn-text-link"
                onClick={() => { setPendingVerification(false); switchMode("login"); }}
              >
                ログイン画面に戻る
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tab */}
            <div className="login-tabs">
              <button
                className={`login-tab${mode === "login" ? " login-tab--active" : ""}`}
                onClick={() => switchMode("login")}
                type="button"
              >
                ログイン
              </button>
              <button
                className={`login-tab${mode === "register" ? " login-tab--active" : ""}`}
                onClick={() => switchMode("register")}
                type="button"
              >
                新規登録
              </button>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
              <div className="login-field">
                <label htmlFor="email">メールアドレス</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  disabled={loading}
                />
              </div>

              <div className="login-field">
                <label htmlFor="password">パスワード{mode === "register" && "（8文字以上）"}</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  required
                  disabled={loading}
                />
              </div>

              {mode === "register" && (
                <div className="login-field">
                  <label htmlFor="username">ユーザー名（任意）</label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="未入力の場合はメールの@前を使用"
                    autoComplete="username"
                    disabled={loading}
                  />
                </div>
              )}

              {error && (
                <div>
                  <p className="login-error">{error}</p>
                  {unverified && (
                    <div className="verify-resend-box">
                      {resendMsg ? (
                        <p className={resendMsg.ok ? "profile-msg-ok" : "profile-msg-err"}>
                          {resendMsg.text}
                        </p>
                      ) : (
                        <button
                          type="button"
                          className="btn-text-link"
                          onClick={() => handleResend(email)}
                          disabled={resendLoading}
                        >
                          {resendLoading ? "送信中..." : "確認メールを再送する"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <button className="btn-primary login-submit" type="submit" disabled={loading}>
                {loading ? "処理中..." : mode === "login" ? "ログイン" : "登録して始める"}
              </button>

              {mode === "login" && (
                <button
                  type="button"
                  className="btn-forgot-password"
                  onClick={() => setResetOpen(true)}
                  disabled={loading}
                >
                  パスワードをお忘れですか？
                </button>
              )}
            </form>
          </>
        )}
      </div>

      {resetOpen && (
        <PasswordResetModal
          onClose={() => setResetOpen(false)}
          onSuccess={() => setResetOpen(false)}
        />
      )}

      <footer className="login-footer">
        <a href="/apps/kakeibo/instructions.html">使い方ガイド</a>
        <span aria-hidden="true"> / </span>
        <a href="/apps/kakeibo/privacy.html">プライバシーポリシー</a>
        <span aria-hidden="true"> / </span>
        <a
          href="https://docs.google.com/forms/d/e/1FAIpQLSfAik5HI7j_tHFLD5zvU8y4cg0AOY-P_ZVU9B9mhctn57CFMQ/viewform"
          target="_blank"
          rel="noopener"
        >
          お問い合わせ
        </a>
        <div className="login-footer-copy">© arinkolab</div>
      </footer>
    </div>
  );
}
