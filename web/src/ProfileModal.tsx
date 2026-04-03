import { useState } from "react";
import { deleteAccount, updateProfile } from "./api";
import { PasswordResetModal } from "./PasswordResetModal";

interface Props {
  displayName: string | null;
  onClose: () => void;
  onUpdated: (newDisplayName: string) => void;
  onLogout: () => void;
}

export function ProfileModal({ displayName, onClose, onUpdated, onLogout }: Props) {
  // ── ユーザー名 ──
  const [username, setUsername] = useState(displayName ?? "");
  const [usernameMsg, setUsernameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [usernameLoading, setUsernameLoading] = useState(false);

  // ── メールアドレス ──
  const [email, setEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  // ── パスワード ──
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  // ── アカウント削除 ──
  const [deletePw, setDeletePw] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── ユーザー名変更 ──
  async function handleUsernameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUsernameMsg(null);
    setUsernameLoading(true);
    const res = await updateProfile({ username: username.trim() || undefined });
    setUsernameLoading(false);
    if ("error" in res) {
      setUsernameMsg({ ok: false, text: res.error });
    } else {
      setUsernameMsg({ ok: true, text: "ユーザー名を変更しました" });
      onUpdated(res.displayName);
    }
  }

  // ── メールアドレス変更 ──
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailMsg(null);
    if (!email.trim()) return;
    setEmailLoading(true);
    const res = await updateProfile({ email: email.trim(), currentPassword: emailPw });
    setEmailLoading(false);
    if ("error" in res) {
      setEmailMsg({ ok: false, text: res.error });
    } else {
      setEmailMsg({ ok: true, text: "メールアドレスを変更しました" });
      setEmail("");
      setEmailPw("");
      onUpdated(res.displayName);
    }
  }

  // ── パスワード変更 ──
  async function handlePwSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPw !== newPw2) {
      setPwMsg({ ok: false, text: "新しいパスワードが一致しません" });
      return;
    }
    if (newPw.length < 8) {
      setPwMsg({ ok: false, text: "パスワードは8文字以上で入力してください" });
      return;
    }
    setPwLoading(true);
    const res = await updateProfile({ currentPassword: curPw, newPassword: newPw });
    setPwLoading(false);
    if ("error" in res) {
      setPwMsg({ ok: false, text: res.error });
    } else {
      setPwMsg({ ok: true, text: "パスワードを変更しました" });
      setCurPw("");
      setNewPw("");
      setNewPw2("");
    }
  }

  // ── アカウント削除 ──
  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleteMsg(null);
    if (!deletePw) {
      setDeleteMsg({ ok: false, text: "パスワードを入力してください" });
      return;
    }
    if (!deleteConfirm) {
      setDeleteMsg({ ok: false, text: "確認チェックを入れてください" });
      return;
    }
    setDeleteLoading(true);
    const res = await deleteAccount(deletePw);
    setDeleteLoading(false);
    if ("error" in res) {
      setDeleteMsg({ ok: false, text: res.error });
    } else {
      localStorage.removeItem("token");
      localStorage.removeItem("userId");
      localStorage.removeItem("displayName");
      onLogout();
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>アカウント設定</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="profile-sections">
          {/* ── ユーザー名 ── */}
          <section className="profile-section">
            <h4 className="profile-section-title">ユーザー名</h4>
            <form onSubmit={handleUsernameSubmit}>
              <div className="form-row">
                <label>
                  ユーザー名:
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="表示名を入力"
                    maxLength={50}
                    disabled={usernameLoading}
                  />
                </label>
              </div>
              {usernameMsg && (
                <p className={usernameMsg.ok ? "profile-msg-ok" : "profile-msg-err"}>
                  {usernameMsg.text}
                </p>
              )}
              <div className="form-actions">
                <button className="btn-add" type="submit" disabled={usernameLoading}>
                  {usernameLoading ? "変更中..." : "変更"}
                </button>
              </div>
            </form>
          </section>

          {/* ── メールアドレス ── */}
          <section className="profile-section">
            <h4 className="profile-section-title">メールアドレス</h4>
            <form onSubmit={handleEmailSubmit}>
              <div className="form-row">
                <label>
                  新しいメールアドレス:
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="new@example.com"
                    disabled={emailLoading}
                    required
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  現在のパスワード:
                  <input
                    type="password"
                    value={emailPw}
                    onChange={(e) => setEmailPw(e.target.value)}
                    placeholder="確認のため入力"
                    disabled={emailLoading}
                    required
                    autoComplete="current-password"
                  />
                </label>
              </div>
              {emailMsg && (
                <p className={emailMsg.ok ? "profile-msg-ok" : "profile-msg-err"}>
                  {emailMsg.text}
                </p>
              )}
              <div className="form-actions">
                <button className="btn-add" type="submit" disabled={emailLoading}>
                  {emailLoading ? "変更中..." : "変更"}
                </button>
              </div>
            </form>
          </section>

          {/* ── パスワード ── */}
          <section className="profile-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h4 className="profile-section-title">パスワード</h4>
              <button
                type="button"
                className="btn-text-link"
                onClick={() => setResetOpen(true)}
                style={{ fontSize: "0.85rem", color: "#0066cc" }}
              >
                リセット用メールを送信
              </button>
            </div>
            <form onSubmit={handlePwSubmit}>
              <div className="form-row">
                <label>
                  現在のパスワード:
                  <input
                    type="password"
                    value={curPw}
                    onChange={(e) => setCurPw(e.target.value)}
                    disabled={pwLoading}
                    required
                    autoComplete="current-password"
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  新しいパスワード（8文字以上）:
                  <input
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    disabled={pwLoading}
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
                    value={newPw2}
                    onChange={(e) => setNewPw2(e.target.value)}
                    disabled={pwLoading}
                    required
                    autoComplete="new-password"
                  />
                </label>
              </div>
              {pwMsg && (
                <p className={pwMsg.ok ? "profile-msg-ok" : "profile-msg-err"}>
                  {pwMsg.text}
                </p>
              )}
              <div className="form-actions">
                <button className="btn-add" type="submit" disabled={pwLoading}>
                  {pwLoading ? "変更中..." : "変更"}
                </button>
              </div>
            </form>
          </section>

          {/* ── アカウント削除 ── */}
          <section className="profile-section profile-section-danger">
            <h4 className="profile-section-title" style={{ color: "#c0392b" }}>アカウント削除</h4>
            <p style={{ fontSize: "0.85rem", color: "#666", margin: "0 0 0.8rem" }}>
              アカウントを削除すると、すべてのデータ（家計簿・カテゴリ・設定）が完全に削除され、復元できません。
            </p>
            <form onSubmit={handleDeleteAccount}>
              <div className="form-row">
                <label>
                  現在のパスワード:
                  <input
                    type="password"
                    value={deletePw}
                    onChange={(e) => setDeletePw(e.target.value)}
                    disabled={deleteLoading}
                    required
                    autoComplete="current-password"
                  />
                </label>
              </div>
              <div className="form-row">
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem" }}>
                  <input
                    type="checkbox"
                    checked={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.checked)}
                    disabled={deleteLoading}
                  />
                  すべてのデータが削除されることを理解しました
                </label>
              </div>
              {deleteMsg && (
                <p className={deleteMsg.ok ? "profile-msg-ok" : "profile-msg-err"}>
                  {deleteMsg.text}
                </p>
              )}
              <div className="form-actions">
                <button
                  className="btn-add"
                  type="submit"
                  disabled={deleteLoading || !deleteConfirm}
                  style={{ backgroundColor: "#c0392b", borderColor: "#c0392b" }}
                >
                  {deleteLoading ? "削除中..." : "アカウントを削除"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>

      {resetOpen && (
        <PasswordResetModal
          onClose={() => setResetOpen(false)}
          onSuccess={() => {
            setResetOpen(false);
          }}
        />
      )}
    </div>
  );
}
