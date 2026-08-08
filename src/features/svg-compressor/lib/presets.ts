import type { Config } from 'svgo/browser';

export type SvgPreset = 'high' | 'balanced' | 'extreme';

export const SVG_PRESETS: ReadonlyArray<{
  id: SvgPreset;
  label: string;
  hint: string;
}> = [
  {
    id: 'high',
    label: '高保真',
    hint: '仅做无损结构清理，坐标精度保留 3 位小数，渲染结果与原始文件一致。',
  },
  {
    id: 'balanced',
    label: '平衡',
    hint: '推荐。坐标精度 2 位 + 多轮优化，体积更小，视觉上无损。',
  },
  {
    id: 'extreme',
    label: '极限',
    hint: '在平衡基础上尝试单色渐变转换、路径复用等进阶优化，自动选取两种方案中体积更小的结果，渲染保持一致。',
  },
];

/** 三档均为“视觉无损”：只做结构/精度层面的优化，不简化几何形状。 */
export function buildSvgoConfig(preset: SvgPreset): Config {
  switch (preset) {
    case 'high':
      return { floatPrecision: 3, multipass: false, plugins: ['preset-default'] };
    case 'balanced':
      return {
        floatPrecision: 2,
        multipass: true,
        plugins: ['preset-default', 'convertOneStopGradients'],
      };
    case 'extreme':
      return {
        floatPrecision: 2,
        multipass: true,
        plugins: ['preset-default', 'convertOneStopGradients', 'reusePaths'],
      };
  }
}
