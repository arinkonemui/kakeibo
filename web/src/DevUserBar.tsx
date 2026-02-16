import { useEffect, useState } from "react";
import { getDevUserId, setDevUserId } from "./api";

interface Props {
  onChange: () => void;
}

/** Dev-only bar for setting X-Debug-User. Only shown on localhost. */
export function DevUserBar({ onChange }: Props) {
  const [value, setValue] = useState(getDevUserId);

  // Show only in local dev
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const host = window.location.hostname;
    setVisible(host === "localhost" || host === "127.0.0.1");
  }, []);

  if (!visible) return null;

  const handleSave = () => {
    setDevUserId(value);
    onChange();
  };

  return (
    <div className="dev-bar">
      <label>
        🔧 Dev user_id:{" "}
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="u_a1b2c3d4e5f60718293a4b5c6d7e8f90"
          size={38}
        />
      </label>
      <button onClick={handleSave}>設定</button>
      <span className="dev-hint">
        形式: u_ + 32桁hex（localStorageに保存）
      </span>
    </div>
  );
}
