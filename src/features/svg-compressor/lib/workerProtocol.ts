import type { SvgPreset } from '@/features/svg-compressor/lib/presets';

export interface OptimizeRequest {
  id: number;
  input: string;
  preset: SvgPreset;
}

export type OptimizeResponse =
  | { id: number; ok: true; text: string }
  | { id: number; ok: false; error: string };
