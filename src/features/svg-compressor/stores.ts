import { create } from 'zustand';
import type { SvgSettings } from '@/features/svg-compressor/lib/types';

/** SVG 工具默认压缩设置（会话级，刷新后重置） */
export const DEFAULT_SVG_SETTINGS: SvgSettings = {
  preset: 'balanced',
  format: 'svg',
  namePrefix: '',
  nameSuffix: '-compressed',
};

/** 影响压缩结果的设置子集（前缀/后缀仅用于下载命名，不触发重新压缩） */
export function svgSettingsKey(settings: SvgSettings): string {
  return JSON.stringify({
    preset: settings.preset,
    format: settings.format,
  });
}

interface SvgSettingsState {
  settings: SvgSettings;
  setSettings: (settings: SvgSettings) => void;
}

export const useSvgSettingsStore = create<SvgSettingsState>()((set) => ({
  settings: DEFAULT_SVG_SETTINGS,
  setSettings: (settings) => set({ settings }),
}));
