/**
 * JSON 工具核心逻辑的对外入口：格式化 / 压缩 / 校验（含精确错误定位与重复键检测）。
 * 解析器、结构对比、类型生成分别见 parser.ts / diff.ts / tsTypes.ts，
 * 本文件负责转换函数并统一 re-export，保持既有调用方兼容。
 */
import {
  parseJson,
  parseJsonLenient,
  parseJsonStrict,
} from './parser';
import { isPlainObject } from './diff';
import type { BigNumberInfo, DuplicateKeyInfo, JsonError, JsonParseOptions } from './parser';

export {
  errorContext,
  findDuplicateKeys,
  offsetFromLineCol,
  offsetToLineCol,
  parseJson,
  parseJsonLenient,
  parseJsonStrict,
} from './parser';
export type {
  BigNumberInfo,
  DuplicateKeyInfo,
  ErrorContext,
  JsonError,
  JsonParseOptions,
  JsonParseResult,
  JsonStrictResult,
} from './parser';

export { diffJson, formatDiffReport, shortValue } from './diff';
export type { JsonChange } from './diff';

export { jsonToTsTypes } from './tsTypes';

export interface ValidateResult {
  ok: boolean;
  error?: JsonError;
  duplicates?: DuplicateKeyInfo[];
  bigNumbers?: BigNumberInfo[];
  size?: number;
  lines?: number;
}

export type JsonTransformResult =
  | { ok: true; text: string; value: unknown; bigNumbers: BigNumberInfo[] }
  | { ok: false; error: JsonError };

export interface JsonTransformOptions extends JsonParseOptions {
  indent?: number;
  sortKeys?: boolean;
  /** 字符串内套 JSON 时自动解包 */
  unwrapString?: boolean;
}

/** 校验 JSON：合法性 + 重复键检测。 */
export function validateJson(
  text: string,
  options: JsonTransformOptions = {},
): ValidateResult {
  const size = text.length;
  const lines = countLines(text);
  const parsed = options.lenient ? parseJsonLenient(text) : parseJsonStrict(text);
  if (!parsed.ok) return { ok: false, error: parsed.error, size, lines };
  let duplicates = parsed.duplicates;
  let bigNumbers = parsed.bigNumbers;
  if (options.unwrapString && typeof parsed.value === 'string') {
    const inner = parsed.value.trim();
    if (inner.startsWith('{') || inner.startsWith('[')) {
      const innerParsed = options.lenient ? parseJsonLenient(inner) : parseJsonStrict(inner);
      if (!innerParsed.ok) {
        return { ok: false, error: innerParsed.error, size, lines };
      }
      duplicates = innerParsed.duplicates;
      bigNumbers = innerParsed.bigNumbers;
    }
  }
  return { ok: true, size, lines, duplicates, bigNumbers };
}

export function formatJson(
  text: string,
  options: JsonTransformOptions = {},
): JsonTransformResult {
  const parsed = options.lenient ? parseJsonLenient(text) : parseJsonStrict(text);
  if (!parsed.ok) return parsed;
  const base = options.unwrapString
    ? unwrapJsonString(parsed.value, options.lenient)
    : parsed.value;
  const value = options.sortKeys ? sortObjectKeys(base) : base;
  return {
    ok: true,
    text: JSON.stringify(value, null, options.indent ?? 2),
    value,
    bigNumbers: parsed.bigNumbers,
  };
}

export function minifyJson(
  text: string,
  options: JsonTransformOptions = {},
): JsonTransformResult {
  const parsed = options.lenient ? parseJsonLenient(text) : parseJsonStrict(text);
  if (!parsed.ok) return parsed;
  const value = options.unwrapString
    ? unwrapJsonString(parsed.value, options.lenient)
    : parsed.value;
  return {
    ok: true,
    text: JSON.stringify(value),
    value,
    bigNumbers: parsed.bigNumbers,
  };
}

/**
 * 若解析值是“字符串里套着合法 JSON”（如 "{\"a\":1}"），返回解包后的内层值；
 * 否则原样返回。用于“自动解包”选项：从日志/配置复制的带引号 JSON 可直接处理。
 */
export function unwrapJsonString(value: unknown, lenient = false): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  const inner = parseJson(trimmed, { lenient });
  return inner.ok ? inner.value : value;
}

/** 递归按字典序排序对象键（数组元素位置不变）；超深嵌套时原样返回。 */
export function sortObjectKeys(value: unknown): unknown {
  try {
    return sortKeysRecursive(value);
  } catch (err) {
    if (err instanceof RangeError) return value;
    throw err;
  }
}

function sortKeysRecursive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysRecursive);
  if (isPlainObject(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeysRecursive(value[key]);
    }
    return sorted;
  }
  return value;
}

function countLines(text: string): number {
  if (text === '') return 0;
  return text.split('\n').length;
}
