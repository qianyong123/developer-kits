import { appMessages } from '@/shared/i18n/zh/app';
import { imageMessages } from '@/shared/i18n/zh/image';
import { jsonMessages } from '@/shared/i18n/zh/json';
import { svgMessages } from '@/shared/i18n/zh/svg';

/** 聚合消息对象：既有代码仍通过 messages.image.xxx 访问，类型保持字面量收窄。 */
export const messages = {
  app: appMessages,
  image: imageMessages,
  svg: svgMessages,
  json: jsonMessages,
} as const;
