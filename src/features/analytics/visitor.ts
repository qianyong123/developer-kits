const VISITOR_KEY = 'analytics.visitor_id';

/** 本地开发地址不参与统计（localhost / 127.0.0.1 / ::1）。 */
export function isLocalHost(): boolean {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/**
 * 读取或生成访客 ID（localStorage 持久化，用于 UV 去重）。
 * 用随机 ID 而非 IP，换网络/设备不串号；存储不可用时每次生成兜底值。
 */
export function getVisitorKey(): string {
  try {
    let key = localStorage.getItem(VISITOR_KEY);
    if (!key) {
      key =
        typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(VISITOR_KEY, key);
    }
    return key;
  } catch {
    return `anon-${Date.now()}`;
  }
}
