import { useState } from "react";
import { authLogin, authRegister } from "./api";

type Mode = "login" | "register";

interface Props {
  onLogin: (token: string, userId: string, displayName: string) => void;
}

export function LoginScreen({ onLogin }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result =
        mode === "register"
          ? await authRegister(email, password, username || undefined)
          : await authLogin(email, password);

      if ("error" in result) {
        setError(result.error);
      } else {
        onLogin(result.token, result.userId, result.displayName);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-brand">おさいふノート</h1>
        <p className="login-catchphrase">1か月を一目で見渡す。兄開きカレンダー型のシンプル家計簿。</p>

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

          {error && <p className="login-error">{error}</p>}

          <button className="btn-primary login-submit" type="submit" disabled={loading}>
            {loading ? "処理中..." : mode === "login" ? "ログイン" : "登録して始める"}
          </button>
        </form>
      </div>
    </div>
  );
}
