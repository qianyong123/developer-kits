import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent, SVGProps } from 'react';
import { BracesIcon, CodeIcon, ImageIcon } from '@/shared/components/Icons';

export type IconType = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

export interface ToolDefinition {
  id: string;
  path: string;
  /** 对应 i18n 导航文案的 key（zh.ts messages.app.*） */
  titleKey: 'navImage' | 'navSvg' | 'navJson';
  icon: IconType;
  /** 首页工具（path 为 /）需要 end，避免其他路由下也保持高亮 */
  end?: boolean;
  Component: LazyExoticComponent<ComponentType>;
}

/**
 * 工具注册表：新增工具 = 在 features 下建目录 + 在这里加一行。
 * 路由与侧边导航都由本表生成，各页面按需懒加载（独立 chunk）。
 */
export const tools: readonly ToolDefinition[] = [
  {
    id: 'image',
    path: '/',
    titleKey: 'navImage',
    icon: ImageIcon,
    end: true,
    Component: lazy(() => import('@/features/image-compressor/ImageCompressorPage')),
  },
  {
    id: 'svg',
    path: '/svg',
    titleKey: 'navSvg',
    icon: CodeIcon,
    Component: lazy(() => import('@/features/svg-compressor/SvgCompressorPage')),
  },
  {
    id: 'json',
    path: '/json',
    titleKey: 'navJson',
    icon: BracesIcon,
    Component: lazy(() => import('@/features/json-tools/JsonToolsPage')),
  },
] as const;
