import type { SvgPreset } from './presets';

export interface OptimizeRequest {
  id: number;
  input: string;
  preset: SvgPreset;
}

export type OptimizeResponse =
  | { id: number; ok: true; text: string }
  | { id: number; ok: false; error: string };
