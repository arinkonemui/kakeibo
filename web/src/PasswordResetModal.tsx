import { useState } from "react";
import { requestPasswordReset, resetPassword } from "./api";

type Stage = "email" | "token";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export function PasswordResetModal({ onClose, onSuccess }: Props) {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // ── ステップ1：メールアドレス入力 ──
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!email.trim()) return;
    setLoading(true);
    const res = await requestPasswordReset(email.trim().toLowerCase());
    setLoading(false);
    if ("error" in res) {
      setMessage({ ok: false, text: res.error });
    } else {
      setMessage({
        ok: true,
        text: "リセットコードをメールで送信しました。コンソールで確認してください。",
      });
      setTimeout(() => setStage("token"), 1500);
    }
  }

  // ── ステップ2：パスワード再設定 ──
  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (newPassword !== newPassword2) {
      setMessage({ ok: false, text: "新しいパスワードが一致しません" });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ ok: false, text: "パスワードは8文字以上で入力してください" });
      return;
    }
    setLoading(true);
    const res = await resetPassword(token.trim(), newPassword);
    setLoading(false);
    if ("error" in res) {
      setMessage({ ok: false, text: res.error });
    } else {
      setMessage({ ok: true, text: "パスワードをリセットしました" });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>パスワードをリセット</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {stage === "email" && (
          <form onSubmit={handleEmailSubmit}>
            <p className="reset-desc">
              登録されているメールアドレスを入力してください。<br />
              リセットコードを送信します。
            </p>
            <div className="form-row">
              <label>
                メールアドレス:
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@example.com"
                  disabled={loading}
                  required
                  autoFocus
                />
              </label>
            </div>
            {message && (
              <p className={message.ok ? "profile-msg-ok" : "profile-msg-err"}>
                {message.text}
              </p>
            )}
            <div className="form-actions">
              <button className="btn-add" type="submit" disabled={loading}>
                {loading ? "送信中..." : "送信"}
              </button>
              <button
                className="btn-cancel"
                type="button"
                onClick={onClose}
                disabled={loading}
              >
                キャンセル
              </button>
            </div>
          </form>
        )}

        {stage === "token" && (
          <form onSubmit={handleResetSubmit}>
            <p className="reset-desc">
              メールに記載されたリセットコードを入力してください。
            </p>
            <div className="form-row">
              <label>
                リセットコード:
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="コードを入力"
                  disabled={loading}
                  required
                  autoFocus
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                新しいパスワード（8文字以上）:
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  required
                  autoComplete="new-password"
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                新しいパスワード（確認）:
                <input
                  type="password"
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                  disabled={loading}
                  required
                  autoComplete="new-password"
                />
              </label>
            </div>
            {message && (
              <p className={message.ok ? "profile-msg-ok" : "profile-msg-err"}>
                {message.text}
              </p>
            )}
            <div className="form-actions">
              <button className="btn-add" type="submit" disabled={loading}>
                {loading ? "変更中..." : "パスワード変更"}
              </button>
              <button
                className="btn-cancel"
                type="button"
                onClick={() => {
                  setStage("email");
                  setToken("");
                  setNewPassword("");
                  setNewPassword2("");
                  setMessage(null);
                }}
                disabled={loading}
              >
                戻る
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
