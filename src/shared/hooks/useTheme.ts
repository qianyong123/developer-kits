import { useCallback, useEffect } from 'react';
import { usePersistedState } from '@/shared/hooks/usePersistedState';

export type Theme = 'light' | 'dark';

// 模块加载时同步应用已保存的主题，避免首帧闪烁
try {
  const saved = localStorage.getItem('devkits.theme');
  document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light';
} catch {
  // 存储不可用时保持默认浅色
}

/** 全局主题：持久化到 localStorage，并同步到 <html data-theme>。 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = usePersistedState<Theme>('devkits.theme', 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'));
  }, [setTheme]);

  return { theme, toggleTheme };
}
