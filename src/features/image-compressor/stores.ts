import { create } from 'zustand';
import type { CompressSettings } from '@/features/image-compressor/lib/types';

/** 图片工具默认压缩设置（会话级，刷新后重置） */
export const DEFAULT_IMAGE_SETTINGS: CompressSettings = {
  quality: 80,
  compressRatio: 100,
  format: 'original',
  keepMetadata: false,
  maxEdge: 4096,
};

interface ImageSettingsState {
  settings: CompressSettings;
  setSettings: (settings: CompressSettings) => void;
}

export const useImageSettingsStore = create<ImageSettingsState>()((set) => ({
  settings: DEFAULT_IMAGE_SETTINGS,
  setSettings: (settings) => set({ settings }),
}));
