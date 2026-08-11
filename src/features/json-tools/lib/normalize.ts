import { parseJson, type JsonError } from './json';

/** 规范化 JSON 值：字符串里套着 JSON 时自动解包（尊重“自动解包”语义）。 */
export function normalizeJsonForOutput(
  value: unknown,
  lenient: boolean,
): { ok: true; value: unknown } | { ok: false; error: JsonError } {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const inner = parseJson(trimmed, { lenient });
      if (!inner.ok) return inner;
      return { ok: true, value: inner.value };
    }
  }
  return { ok: true, value };
}
