import { create } from 'zustand';
import type { SvgSettings } from '@/features/svg-compressor/lib/types';

/** SVG 工具默认压缩设置（会话级，刷新后重置） */
export const DEFAULT_SVG_SETTINGS: SvgSettings = {
  preset: 'balanced',
  format: 'svg',
};

interface SvgSettingsState {
  settings: SvgSettings;
  setSettings: (settings: SvgSettings) => void;
}

export const useSvgSettingsStore = create<SvgSettingsState>()((set) => ({
  settings: DEFAULT_SVG_SETTINGS,
  setSettings: (settings) => set({ settings }),
}));
