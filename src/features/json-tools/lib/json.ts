/**
 * JSON 工具核心逻辑：格式化 / 压缩 / 校验（含精确错误定位与重复键检测）/ 结构对比。
 * 解析采用自研严格 JSON 解析器（兼容标准 JSON 全部语法），
 * 因为现代 V8 的 JSON.parse 错误信息不再包含位置，无法精确报行列。
 * 纯 TS、无 React 依赖，可独立单测。
 */

export interface JsonError {
  message: string;
  offset?: number;
  line?: number;
  column?: number;
}

export interface DuplicateKeyInfo {
  key: string;
  firstLine: number;
  secondLine: number;
}

export interface ValidateResult {
  ok: boolean;
  error?: JsonError;
  duplicates?: DuplicateKeyInfo[];
  size?: number;
  lines?: number;
}

export type JsonParseResult = { ok: true; value: unknown } | { ok: false; error: JsonError };
export type JsonTransformResult = { ok: true; text: string } | { ok: false; error: JsonError };

export interface JsonChange {
  path: string;
  type: 'added' | 'removed' | 'changed';
  before?: unknown;
  after?: unknown;
}

class JsonSyntaxError extends Error {
  error: JsonError;

  constructor(error: JsonError) {
    super(error.message);
    this.error = error;
  }
}

/** 严格 JSON 递归下降解析器：解析值的同时收集重复键与首个语法错误位置。 */
class JsonParser {
  private pos = 0;
  private readonly text: string;
  private readonly duplicates: DuplicateKeyInfo[] = [];

  constructor(text: string) {
    this.text = text;
  }

  parse(): unknown {
    this.skipWhitespace();
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.pos < this.text.length) {
      this.fail(`意外的字符 "${this.text[this.pos]}"`);
    }
    return value;
  }

  getDuplicates(): DuplicateKeyInfo[] {
    return this.duplicates;
  }

  private parseValue(): unknown {
    this.skipWhitespace();
    const ch = this.text[this.pos];
    if (ch === '{') return this.parseObject();
    if (ch === '[') return this.parseArray();
    if (ch === '"') return this.parseString();
    if (ch === 't') return this.expectWord('true', true);
    if (ch === 'f') return this.expectWord('false', false);
    if (ch === 'n') return this.expectWord('null', null);
    if (ch === '-' || (ch !== undefined && ch >= '0' && ch <= '9')) return this.parseNumber();
    this.fail(ch === undefined ? 'JSON 意外结束' : `意外的字符 "${ch}"`);
  }

  private parseObject(): Record<string, unknown> {
    this.pos += 1; // '{'
    const object: Record<string, unknown> = {};
    const keyLines = new Map<string, number>();
    this.skipWhitespace();
    if (this.text[this.pos] === '}') {
      this.pos += 1;
      return object;
    }
    for (;;) {
      this.skipWhitespace();
      const keyOffset = this.pos;
      if (this.text[this.pos] !== '"') this.fail('期望属性键（字符串）');
      const key = this.parseString();
      this.skipWhitespace();
      if (this.text[this.pos] !== ':') this.fail("期望 ':'");
      this.pos += 1;
      const value = this.parseValue();
      const firstLine = keyLines.get(key);
      if (firstLine !== undefined) {
        this.duplicates.push({
          key,
          firstLine,
          secondLine: lineAt(this.text, keyOffset),
        });
      } else {
        keyLines.set(key, lineAt(this.text, keyOffset));
      }
      object[key] = value;
      this.skipWhitespace();
      const next = this.text[this.pos];
      if (next === ',') {
        this.pos += 1;
        continue;
      }
      if (next === '}') {
        this.pos += 1;
        return object;
      }
      this.fail("期望 ',' 或 '}'");
    }
  }

  private parseArray(): unknown[] {
    this.pos += 1; // '['
    const array: unknown[] = [];
    this.skipWhitespace();
    if (this.text[this.pos] === ']') {
      this.pos += 1;
      return array;
    }
    for (;;) {
      array.push(this.parseValue());
      this.skipWhitespace();
      const next = this.text[this.pos];
      if (next === ',') {
        this.pos += 1;
        continue;
      }
      if (next === ']') {
        this.pos += 1;
        return array;
      }
      this.fail("期望 ',' 或 ']'");
    }
  }

  private parseString(): string {
    let result = '';
    this.pos += 1; // 起始引号
    for (;;) {
      if (this.pos >= this.text.length) this.fail('字符串未闭合');
      const ch = this.text[this.pos];
      if (ch === '"') {
        this.pos += 1;
        return result;
      }
      if (ch === '\\') {
        this.pos += 1;
        const escaped = this.text[this.pos];
        switch (escaped) {
          case '"':
            result += '"';
            break;
          case '\\':
            result += '\\';
            break;
          case '/':
            result += '/';
            break;
          case 'b':
            result += '\b';
            break;
          case 'f':
            result += '\f';
            break;
          case 'n':
            result += '\n';
            break;
          case 'r':
            result += '\r';
            break;
          case 't':
            result += '\t';
            break;
          case 'u': {
            const hex = this.text.slice(this.pos + 1, this.pos + 5);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('无效的 \\u 转义');
            result += String.fromCharCode(parseInt(hex, 16));
            this.pos += 4;
            break;
          }
          default:
            this.fail('无效的转义字符');
        }
        this.pos += 1;
        continue;
      }
      // JSON 字符串中的控制字符必须转义
      if (ch.charCodeAt(0) < 0x20) this.fail('字符串中包含未转义的控制字符');
      result += ch;
      this.pos += 1;
    }
  }

  private parseNumber(): number {
    const start = this.pos;
    if (this.text[this.pos] === '-') this.pos += 1;
    if (this.text[this.pos] === '0') {
      this.pos += 1;
    } else if (
      this.text[this.pos] >= '1' &&
      this.text[this.pos] <= '9'
    ) {
      while (
        this.pos < this.text.length &&
        this.text[this.pos] >= '0' &&
        this.text[this.pos] <= '9'
      ) {
        this.pos += 1;
      }
    } else {
      this.fail('数字格式错误');
    }
    if (this.text[this.pos] === '.') {
      this.pos += 1;
      if (!(this.text[this.pos] >= '0' && this.text[this.pos] <= '9')) {
        this.fail('数字格式错误');
      }
      while (
        this.pos < this.text.length &&
        this.text[this.pos] >= '0' &&
        this.text[this.pos] <= '9'
      ) {
        this.pos += 1;
      }
    }
    if (this.text[this.pos] === 'e' || this.text[this.pos] === 'E') {
      this.pos += 1;
      if (this.text[this.pos] === '+' || this.text[this.pos] === '-') this.pos += 1;
      if (!(this.text[this.pos] >= '0' && this.text[this.pos] <= '9')) {
        this.fail('数字格式错误');
      }
      while (
        this.pos < this.text.length &&
        this.text[this.pos] >= '0' &&
        this.text[this.pos] <= '9'
      ) {
        this.pos += 1;
      }
    }
    return Number(this.text.slice(start, this.pos));
  }

  private expectWord(word: 'true' | 'false' | 'null', value: unknown): unknown {
    if (this.text.slice(this.pos, this.pos + word.length) !== word) {
      this.fail(`意外的字符 "${this.text[this.pos]}"`);
    }
    this.pos += word.length;
    return value;
  }

  private skipWhitespace(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) {
      this.pos += 1;
    }
  }

  private fail(message: string): never {
    const offset = this.pos;
    const { line, column } = offsetToLineCol(this.text, offset);
    throw new JsonSyntaxError({ message, offset, line, column });
  }
}

/** 严格解析 JSON：返回解析值与重复键清单，或带精确行列的语法错误。 */
export function parseJsonStrict(
  text: string,
): { ok: true; value: unknown; duplicates: DuplicateKeyInfo[] } | { ok: false; error: JsonError } {
  if (text.trim() === '') return { ok: false, error: { message: 'empty' } };
  try {
    const parser = new JsonParser(text);
    const value = parser.parse();
    return { ok: true, value, duplicates: parser.getDuplicates() };
  } catch (err) {
    if (err instanceof JsonSyntaxError) return { ok: false, error: err.error };
    return { ok: false, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

/** 解析 JSON（校验模式之外也可用）；空输入视为错误。 */
export function parseJson(text: string): JsonParseResult {
  const result = parseJsonStrict(text);
  if (!result.ok) return result;
  return { ok: true, value: result.value };
}

/** 校验 JSON：合法性 + 重复键检测。 */
export function validateJson(text: string): ValidateResult {
  const size = text.length;
  const lines = countLines(text);
  const parsed = parseJsonStrict(text);
  if (!parsed.ok) return { ok: false, error: parsed.error, size, lines };
  return { ok: true, size, lines, duplicates: parsed.duplicates };
}

export function formatJson(
  text: string,
  indent = 2,
  sortKeys = false,
): JsonTransformResult {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  const value = sortKeys ? sortObjectKeys(parsed.value) : parsed.value;
  return { ok: true, text: JSON.stringify(value, null, indent) };
}

export function minifyJson(text: string): JsonTransformResult {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  return { ok: true, text: JSON.stringify(parsed.value) };
}

/** 递归按字典序排序对象键（数组元素位置不变）。 */
export function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (isPlainObject(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortObjectKeys(value[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * 结构对比：递归比较两棵树，输出按路径拆分的 新增/删除/修改 清单。
 * 数组按索引对齐（v0 不做 LCS 重排）；对象/数组整体类型变化记为一个修改。
 */
export function diffJson(before: unknown, after: unknown): JsonChange[] {
  const changes: JsonChange[] = [];
  walk(before, after, '$', changes);
  return changes;
}

function walk(before: unknown, after: unknown, path: string, changes: JsonChange[]): void {
  const beforeObj = isPlainObject(before);
  const afterObj = isPlainObject(after);
  const beforeArr = Array.isArray(before);
  const afterArr = Array.isArray(after);

  if (beforeObj && afterObj) {
    const beforeRecord = before as Record<string, unknown>;
    const afterRecord = after as Record<string, unknown>;
    const keys = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);
    for (const key of keys) {
      const childPath = joinPath(path, key);
      if (!(key in afterRecord)) {
        changes.push({ path: childPath, type: 'removed', before: beforeRecord[key] });
      } else if (!(key in beforeRecord)) {
        changes.push({ path: childPath, type: 'added', after: afterRecord[key] });
      } else {
        walk(beforeRecord[key], afterRecord[key], childPath, changes);
      }
    }
    return;
  }

  if (beforeArr && afterArr) {
    const length = Math.max(before.length, after.length);
    for (let i = 0; i < length; i += 1) {
      const childPath = `${path}[${i}]`;
      if (i >= before.length) {
        changes.push({ path: childPath, type: 'added', after: after[i] });
      } else if (i >= after.length) {
        changes.push({ path: childPath, type: 'removed', before: before[i] });
      } else {
        walk(before[i], after[i], childPath, changes);
      }
    }
    return;
  }

  if (!deepEqual(before, after)) {
    changes.push({ path, type: 'changed', before, after });
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((value, i) => deepEqual(value, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const aKeys = Object.keys(aRecord);
    const bKeys = Object.keys(bRecord);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(
      (key) => key in bRecord && deepEqual(aRecord[key], bRecord[key]),
    );
  }
  return false;
}

function joinPath(path: string, key: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) return `${path}.${key}`;
  return `${path}[${JSON.stringify(key)}]`;
}

/** 检测重复键（输入必须是合法 JSON，否则返回空列表）。 */
export function findDuplicateKeys(text: string): DuplicateKeyInfo[] {
  const parsed = parseJsonStrict(text);
  return parsed.ok ? parsed.duplicates : [];
}

export function offsetToLineCol(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i += 1) {
    if (text[i] === '\n') {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

function lineAt(text: string, offset: number): number {
  return offsetToLineCol(text, offset).line;
}

function countLines(text: string): number {
  if (text === '') return 0;
  return text.split('\n').length;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 值的紧凑展示，超长截断。 */
export function shortValue(value: unknown, maxLength = 80): string {
  const text = JSON.stringify(value);
  if (text === undefined) return 'undefined';
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/** 生成可复制/下载的结构 diff 报告。 */
export function formatDiffReport(changes: JsonChange[]): string {
  return changes
    .map((change) => {
      const before = change.before === undefined ? 'undefined' : shortValue(change.before, 200);
      const after = change.after === undefined ? 'undefined' : shortValue(change.after, 200);
      if (change.type === 'added') return `${change.path}: + ${after}`;
      if (change.type === 'removed') return `${change.path}: - ${before}`;
      return `${change.path}: ${before} → ${after}`;
    })
    .join('\n');
}
