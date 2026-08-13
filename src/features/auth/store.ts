import { create } from 'zustand';
import { fetchCurrentUser, login as loginApi, register as registerApi } from '@/features/auth/api';
import { readToken, writeToken } from '@/features/auth/storage';
import type { AuthActionResult, AuthUser } from '@/features/auth/types';

/** 登录态：checking 初始校验中 / guest 未登录 / authenticated 已登录。 */
export type AuthStatus = 'checking' | 'guest' | 'authenticated';

interface AuthStore {
  status: AuthStatus;
  user: AuthUser | null;
  token: string | null;
  /** 恢复本地 token 并向后端校验（幂等，可重复调用）。 */
  initialize: () => Promise<void>;
  login: (username: string, password: string) => Promise<AuthActionResult>;
  register: (username: string, password: string) => Promise<AuthActionResult>;
  signOut: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  status: 'checking',
  user: null,
  token: null,

  initialize: async () => {
    // 已初始化过则跳过，避免重复请求
    if (get().status !== 'checking') {
      return;
    }
    const token = readToken();
    if (!token) {
      set({ status: 'guest', user: null, token: null });
      return;
    }
    try {
      const user = await fetchCurrentUser(token);
      set({ status: 'authenticated', user, token });
    } catch {
      // token 失效或网络异常：清除本地登录态，回到访客
      writeToken(null);
      set({ status: 'guest', user: null, token: null });
    }
  },

  login: async (username, password) => {
    try {
      const session = await loginApi(username, password);
      writeToken(session.token);
      set({ status: 'authenticated', user: session.user, token: session.token });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '登录失败，请稍后重试' };
    }
  },

  register: async (username, password) => {
    try {
      const session = await registerApi(username, password);
      writeToken(session.token);
      set({ status: 'authenticated', user: session.user, token: session.token });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '注册失败，请稍后重试' };
    }
  },

  signOut: () => {
    writeToken(null);
    set({ status: 'guest', user: null, token: null });
  },
}));
