import type { Config } from 'svgo/browser';
import { buildSvgoConfig } from '@/features/svg-compressor/lib/presets';

export type OptimizeFn = (input: string, config: Config) => { data: string };

/** 极限档：进阶优化（如路径复用）在小文件上可能有额外开销，取两种方案中更小的结果。 */
export function optimizeExtreme(input: string, optimize: OptimizeFn): string {
  const balanced = optimize(input, buildSvgoConfig('balanced')).data;
  const extreme = optimize(input, buildSvgoConfig('extreme')).data;
  return extreme.length < balanced.length ? extreme : balanced;
}
