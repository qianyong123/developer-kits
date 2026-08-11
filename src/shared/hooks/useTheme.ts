import { useEffect } from 'react';
import { create } from 'zustand';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'devkits.theme';

/** 读取持久化主题；存储不可用时回退浅色。 */
function loadSavedTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'dark' ? 'dark' : 'light';
  } catch {
    // 存储不可用时保持默认浅色
    return 'light';
  }
}

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
}

/**
 * 跨组件共享的主题状态：AppShell 切换后，其他已挂载页面（如 JSON 编辑器）
 * 无需重挂载即可同步响应；同时持久化到 localStorage 并同步 <html data-theme>。
 */
export const useThemeStore = create<ThemeState>((set) => ({
  theme: loadSavedTheme(),
  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // 存储不可用时仅本次会话生效
      }
      document.documentElement.dataset.theme = next;
      return { theme: next };
    }),
}));

// 模块加载时同步应用已保存的主题，避免首帧闪烁
document.documentElement.dataset.theme = useThemeStore.getState().theme;

/** 全局主题：跨组件共享并持久化，所有调用方随切换即时更新。 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return { theme, toggleTheme };
}
