import type {
  BigNumberInfo,
  DuplicateKeyInfo,
  JsonChange,
  JsonError,
} from '@/features/json-tools/lib/json';

/** 工具模式：格式化校验 / 对比 / 类型转换 */
export type JsonMode = 'process' | 'diff' | 'type';

/** 处理动作：格式化 / 压缩 / 校验 */
export type ProcessAction = 'format' | 'minify' | 'validate';

/** 输出结果状态：空闲 / 错误 / 文本 / 校验通过 / 对比差异 */
export type OutputState =
  | { kind: 'idle' }
  | { kind: 'error'; error: JsonError; side?: 'before' | 'after' }
  | { kind: 'text'; text: string; value: unknown; bigNumbers: BigNumberInfo[] }
  | { kind: 'valid'; duplicates: DuplicateKeyInfo[]; bigNumbers: BigNumberInfo[] }
  | { kind: 'diff'; changes: JsonChange[] };
