import { create } from 'zustand';
import type { CompressSettings } from '@/features/image-compressor/lib/types';

/** 图片工具默认压缩设置（会话级，刷新后重置） */
export const DEFAULT_IMAGE_SETTINGS: CompressSettings = {
  quality: 80,
  compressRatio: 100,
  format: 'original',
  keepMetadata: false,
  maxEdge: 4096,
  namePrefix: '',
  nameSuffix: '-compressed',
};

/** 影响压缩结果的设置子集（前缀/后缀仅用于下载命名，不触发重新压缩） */
export function compressSettingsKey(settings: CompressSettings): string {
  return JSON.stringify({
    quality: settings.quality,
    compressRatio: settings.compressRatio,
    format: settings.format,
    keepMetadata: settings.keepMetadata,
    maxEdge: settings.maxEdge,
  });
}

interface ImageSettingsState {
  settings: CompressSettings;
  setSettings: (settings: CompressSettings) => void;
}

export const useImageSettingsStore = create<ImageSettingsState>()((set) => ({
  settings: DEFAULT_IMAGE_SETTINGS,
  setSettings: (settings) => set({ settings }),
}));
