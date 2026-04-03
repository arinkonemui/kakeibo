import { useState } from "react";
import { cacheClear } from "./monthlyCache";

const TOKEN_KEY = "osaifu_token";
const USER_ID_KEY = "osaifu_user_id";
const DISPLAY_NAME_KEY = "osaifu_display_name";

export interface AuthState {
  token: string | null;
  userId: string | null;
  displayName: string | null;
}

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>(() => ({
    token: localStorage.getItem(TOKEN_KEY),
    userId: localStorage.getItem(USER_ID_KEY),
    displayName: localStorage.getItem(DISPLAY_NAME_KEY),
  }));

  function login(token: string, userId: string, displayName: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_ID_KEY, userId);
    localStorage.setItem(DISPLAY_NAME_KEY, displayName);
    setAuth({ token, userId, displayName });
  }

  function updateDisplayName(displayName: string) {
    localStorage.setItem(DISPLAY_NAME_KEY, displayName);
    setAuth((prev) => ({ ...prev, displayName }));
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(DISPLAY_NAME_KEY);
    cacheClear();
    setAuth({ token: null, userId: null, displayName: null });
  }

  return { ...auth, login, logout, updateDisplayName };
}
