import { appMessages } from '@/shared/i18n/zh/app';
import { analyticsMessages } from '@/shared/i18n/zh/analytics';
import { imageMessages } from '@/shared/i18n/zh/image';
import { jsonMessages } from '@/shared/i18n/zh/json';
import { svgMessages } from '@/shared/i18n/zh/svg';

/** 跨工具共享文案（对比预览等公共组件使用）。 */
export const sharedMessages = {
  compareSwitchLabel: '切换预览视图',
  compareHint: '使用 ← → 方向键或两侧箭头切换',
} as const;

/** 聚合消息对象：既有代码仍通过 messages.image.xxx 访问，类型保持字面量收窄。 */
export const messages = {
  app: appMessages,
  analytics: analyticsMessages,
  image: imageMessages,
  svg: svgMessages,
  json: jsonMessages,
  shared: sharedMessages,
} as const;
