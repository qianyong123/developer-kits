const TOKEN_KEY = 'auth.token';

/** 读取本地 token；localStorage 不可用时返回 null。 */
export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** 写入或清除本地 token（null 表示清除）。 */
export function writeToken(token: string | null): void {
  try {
    if (token === null) {
      localStorage.removeItem(TOKEN_KEY);
    } else {
      localStorage.setItem(TOKEN_KEY, token);
    }
  } catch {
    // 隐私模式/配额不足：忽略，仅影响刷新后的登录态保持
  }
}
