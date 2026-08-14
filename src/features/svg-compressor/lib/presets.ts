import type { Config } from 'svgo/browser';

export type SvgPreset = 'high' | 'balanced' | 'extreme';

/**
 * 安全净化插件：移除事件属性、外部资源引用与危险链接。
 * script 元素由 SVGO 内置 removeScripts 插件处理，这里兜底并处理其余风险。
 */
const sanitizePlugin = {
  name: 'removeEventAttrsAndExternalRefs',
  description: '移除事件属性、外部资源引用与危险链接',
  fn: () => ({
    element: {
      enter: (
        node: { name: string; attributes: Record<string, string>; children: unknown[] },
        parentNode: { children: unknown[] } | null,
      ) => {
        // script 元素兜底移除（内置 removeScripts 之外再确认一次）
        if (node.name === 'script') {
          if (parentNode) {
            const index = parentNode.children.indexOf(node);
            if (index !== -1) parentNode.children.splice(index, 1);
          }
          return;
        }
        // 事件属性（onclick/onload/onerror 等）
        for (const attr of Object.keys(node.attributes)) {
          if (/^on/i.test(attr)) delete node.attributes[attr];
        }
        // 外部/危险链接：javascript: 协议、http(s) 或 // 开头的 URL
        for (const attr of ['href', 'xlink:href']) {
          const value = node.attributes[attr];
          if (
            value !== undefined &&
            (/^\s*javascript:/i.test(value) || /^(https?:)?\/\//i.test(value))
          ) {
            delete node.attributes[attr];
          }
        }
        // style 属性中的外部 url() 引用
        const style = node.attributes.style;
        if (style !== undefined && /url\(\s*(['"]?)(?:https?:)?\/\//i.test(style)) {
          const cleaned = style
            .replace(/url\(\s*(['"]?)(?:https?:)?\/\/[^)]*\)/gi, 'none')
            .trim();
          if (cleaned === '') delete node.attributes.style;
          else node.attributes.style = cleaned;
        }
        // style 元素中的外部 @import
        if (node.name === 'style') {
          for (const child of node.children) {
            const text = child as { type?: string; value?: unknown };
            if (text.type === 'text' && typeof text.value === 'string') {
              text.value = text.value.replace(/@import\s+[^;]*?(?:https?:)?\/\/[^;]*;/gi, '');
            }
          }
        }
      },
    },
  }),
} as const;

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
      return {
        floatPrecision: 3,
        multipass: false,
        plugins: ['preset-default', 'removeScripts', sanitizePlugin],
      };
    case 'balanced':
      return {
        floatPrecision: 2,
        multipass: true,
        plugins: ['preset-default', 'convertOneStopGradients', 'removeScripts', sanitizePlugin],
      };
    case 'extreme':
      return {
        floatPrecision: 2,
        multipass: true,
        plugins: [
          'preset-default',
          'convertOneStopGradients',
          'reusePaths',
          'removeScripts',
          sanitizePlugin,
        ],
      };
  }
}
