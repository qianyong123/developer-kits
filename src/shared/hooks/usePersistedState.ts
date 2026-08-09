import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

/**
 * 类似 useState，但值会持久化到 localStorage。
 * 读取失败（损坏/不可用）时静默回退到初始值；写入失败不阻塞 UI。
 */
export function usePersistedState<T>(
  key: string,
  initialValue: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      // 数据损坏或存储不可用：使用初始值
    }
    return typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 配额不足/隐私模式等：静默忽略
    }
  }, [key, value]);

  return [value, setValue];
}
