import { messages } from '@/shared/i18n/zh';
import type { JsonMode, ProcessAction } from './types';

/** 单文件导入大小上限 */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
/** 超过该长度的字符串值用高亮框完整展示（不再截断） */
export const LONG_STRING_LENGTH = 80;

export const MODES: Array<{ id: JsonMode; label: string }> = [
  { id: 'process', label: messages.json.modeProcess },
  { id: 'diff', label: messages.json.modeDiff },
  { id: 'type', label: messages.json.modeType },
];

export const PROCESS_ACTIONS: ProcessAction[] = ['format', 'minify', 'validate'];
export const PROCESS_ACTION_LABELS: Record<ProcessAction, string> = {
  format: messages.json.modeFormat,
  minify: messages.json.modeMinify,
  validate: messages.json.modeValidate,
};

/** 示例数据：类型转换 / 格式化使用 */
export const SAMPLE = JSON.stringify(
  {
    name: '开发工具包',
    version: '0.1.0',
    tools: ['图片压缩', 'SVG 压缩', 'JSON 工具'],
    stats: { downloads: 1234, rating: 4.8, active: true },
    config: { theme: 'light', language: 'zh-CN' },
  },
  null,
  2,
);

/** 对比示例：修改前 */
export const SAMPLE_BEFORE = JSON.stringify(
  {
    project: '开发工具包',
    version: '0.1.0',
    members: [
      { name: '张三', role: '前端', active: true },
      { name: '李四', role: '后端', active: true },
      { name: '陈七', role: '运维', active: true },
    ],
    config: {
      theme: 'light',
      lang: 'zh-CN',
      limits: { maxFiles: 50, maxSize: 5 },
      legacy: true,
    },
  },
  null,
  2,
);

/** 对比示例：修改后 */
export const SAMPLE_AFTER = JSON.stringify(
  {
    project: '开发工具包',
    version: '0.2.0',
    members: [
      { name: '张三', role: '前端', active: true },
      { name: '李四', role: '后端', active: true },
      { name: '王五', role: '测试', active: true },
      { name: '王五444', role: '测试', active: true },
    ],
    config: {
      theme: 'dark',
      lang: 'zh-CN',
      limits: { maxFiles: 100, maxSize: 10, maxUploads: 20 },
    },
  },
  null,
  2,
);
