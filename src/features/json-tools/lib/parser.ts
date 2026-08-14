/**
 * JSON 严格/宽松解析器：语法错误精确到行列、重复键检测、超安全整数范围大数检测。
 * 采用自研递归下降解析器（兼容标准 JSON 全部语法），
 * 因为现代 V8 的 JSON.parse 错误信息不再包含位置，无法精确报行列。
 * 纯 TS、无 React 依赖，可独立单测。
 */
import JSON5 from 'json5';

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

export interface BigNumberInfo {
  line: number;
  column: number;
  raw: string;
}

export interface JsonParseOptions {
  /** 宽松模式（JSONC/JSON5）：允许注释、尾逗号、单引号、无引号键 */
  lenient?: boolean;
}

export type JsonParseResult = { ok: true; value: unknown } | { ok: false; error: JsonError };

export type JsonStrictResult =
  | {
      ok: true;
      value: unknown;
      duplicates: DuplicateKeyInfo[];
      bigNumbers: BigNumberInfo[];
    }
  | { ok: false; error: JsonError };

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
  private readonly bigNumbers: BigNumberInfo[] = [];

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

  getBigNumbers(): BigNumberInfo[] {
    return this.bigNumbers;
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
    // 用数组累积代替字符串拼接，避免超长字符串的 O(n²) 拼接开销
    const parts: string[] = [];
    this.pos += 1; // 起始引号
    for (;;) {
      if (this.pos >= this.text.length) this.fail('字符串未闭合');
      const ch = this.text[this.pos];
      if (ch === '"') {
        this.pos += 1;
        return parts.join('');
      }
      if (ch === '\\') {
        this.pos += 1;
        const escaped = this.text[this.pos];
        switch (escaped) {
          case '"':
            parts.push('"');
            break;
          case '\\':
            parts.push('\\');
            break;
          case '/':
            parts.push('/');
            break;
          case 'b':
            parts.push('\b');
            break;
          case 'f':
            parts.push('\f');
            break;
          case 'n':
            parts.push('\n');
            break;
          case 'r':
            parts.push('\r');
            break;
          case 't':
            parts.push('\t');
            break;
          case 'u': {
            const hex = this.text.slice(this.pos + 1, this.pos + 5);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('无效的 \\u 转义');
            parts.push(String.fromCharCode(parseInt(hex, 16)));
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
      parts.push(ch);
      this.pos += 1;
    }
  }

  private parseNumber(): number {
    const start = this.pos;
    if (this.text[this.pos] === '-') this.pos += 1;
    if (this.text[this.pos] === '0') {
      this.pos += 1;
    } else if (this.text[this.pos] >= '1' && this.text[this.pos] <= '9') {
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
    const raw = this.text.slice(start, this.pos);
    // 超出 2^53 安全整数范围的整数字面量：JSON.parse/Number 会丢失精度
    if (/^-?\d+$/.test(raw)) {
      const value = BigInt(raw);
      if (value > 9007199254740991n || value < -9007199254740991n) {
        const { line, column } = offsetToLineCol(this.text, start);
        this.bigNumbers.push({ line, column, raw });
      }
    }
    return Number(raw);
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
export function parseJsonStrict(text: string): JsonStrictResult {
  if (text.trim() === '') return { ok: false, error: { message: 'empty' } };
  try {
    const parser = new JsonParser(text);
    const value = parser.parse();
    return {
      ok: true,
      value,
      duplicates: parser.getDuplicates(),
      bigNumbers: parser.getBigNumbers(),
    };
  } catch (err) {
    if (err instanceof JsonSyntaxError) return { ok: false, error: err.error };
    // 深层嵌套超出调用栈：返回友好错误而不是让页面崩溃
    if (err instanceof RangeError) {
      return { ok: false, error: { message: '嵌套过深，超出解析深度上限' } };
    }
    return { ok: false, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

/** 解析 JSON（校验模式之外也可用）；空输入视为错误。 */
export function parseJson(text: string, options: JsonParseOptions = {}): JsonParseResult {
  if (options.lenient) return parseJsonLenient(text);
  const result = parseJsonStrict(text);
  if (!result.ok) return result;
  return { ok: true, value: result.value };
}

/** 宽松解析（JSONC/JSON5）：返回结构与严格解析一致（重复键/大数不检测）。 */
export function parseJsonLenient(text: string): JsonStrictResult {
  if (text.trim() === '') return { ok: false, error: { message: 'empty' } };
  try {
    return { ok: true, value: JSON5.parse(text), duplicates: [], bigNumbers: [] };
  } catch (err) {
    if (err instanceof RangeError) {
      return { ok: false, error: { message: '嵌套过深，超出解析深度上限' } };
    }
    const e = err as { message?: string; lineNumber?: number; columnNumber?: number };
    return {
      ok: false,
      error: {
        message: e.message ?? String(err),
        line: e.lineNumber,
        column: e.columnNumber,
      },
    };
  }
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

/** 由 1 基行列反算字符偏移（与 offsetToLineCol 互逆）。 */
export function offsetFromLineCol(text: string, line: number, column: number): number {
  let currentLine = 1;
  for (let i = 0; i < text.length; i += 1) {
    if (currentLine === line) return Math.min(text.length, i + column - 1);
    if (text[i] === '\n') currentLine += 1;
  }
  return text.length;
}

export interface ErrorContext {
  /** 出错位置前的片段（不含错误字符） */
  before: string;
  /** 出错位置起的片段（首字符即出错字符） */
  after: string;
  /** 片段前是否被截断 */
  hasBefore: boolean;
  /** 片段后是否被截断 */
  hasAfter: boolean;
}

/** 提取报错位置附近的文本片段，便于快速定位；无法定位时返回 null。 */
export function errorContext(text: string, error: JsonError, radius = 16): ErrorContext | null {
  let offset = error.offset;
  if (offset === undefined) {
    if (error.line === undefined || error.column === undefined) return null;
    offset = offsetFromLineCol(text, error.line, error.column);
  }
  if (offset < 0 || offset > text.length) return null;
  const clean = (part: string) => part.replace(/\r?\n/g, '↵').replace(/\t/g, ' ');
  const before = clean(text.slice(Math.max(0, offset - radius), offset));
  const after = clean(text.slice(offset, Math.min(text.length, offset + radius)));
  return {
    before,
    after,
    hasBefore: offset - radius > 0,
    hasAfter: offset + radius < text.length,
  };
}

function lineAt(text: string, offset: number): number {
  return offsetToLineCol(text, offset).line;
}
