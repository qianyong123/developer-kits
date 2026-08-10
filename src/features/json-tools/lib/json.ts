/**
 * JSON 工具核心逻辑：格式化 / 压缩 / 校验（含精确错误定位与重复键检测）/ 结构对比。
 * 解析采用自研严格 JSON 解析器（兼容标准 JSON 全部语法），
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

export interface ValidateResult {
  ok: boolean;
  error?: JsonError;
  duplicates?: DuplicateKeyInfo[];
  bigNumbers?: BigNumberInfo[];
  size?: number;
  lines?: number;
}

export type JsonParseResult = { ok: true; value: unknown } | { ok: false; error: JsonError };
export type JsonTransformResult =
  | { ok: true; text: string; value: unknown; bigNumbers: BigNumberInfo[] }
  | { ok: false; error: JsonError };

export interface JsonParseOptions {
  /** 宽松模式（JSONC/JSON5）：允许注释、尾逗号、单引号、无引号键 */
  lenient?: boolean;
}

export interface JsonTransformOptions extends JsonParseOptions {
  indent?: number;
  sortKeys?: boolean;
  /** 字符串内套 JSON 时自动解包 */
  unwrapString?: boolean;
}

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
export type JsonStrictResult =
  | { ok: true; value: unknown; duplicates: DuplicateKeyInfo[]; bigNumbers: BigNumberInfo[] }
  | { ok: false; error: JsonError };

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

export function minifyJson(text: string, options: JsonTransformOptions = {}): JsonTransformResult {
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
    arrayDiff(before, after, path, changes);
    return;
  }

  if (!deepEqual(before, after)) {
    changes.push({ path, type: 'changed', before, after });
  }
}

/**
 * 数组 LCS diff：按最长公共子序列对齐元素（deepEqual 判等），
 * 只输出真正的删除/新增，避免“中间插入一个元素导致后面全部变更”。
 */
function arrayDiff(
  before: unknown[],
  after: unknown[],
  path: string,
  changes: JsonChange[],
): void {
  const n = before.length;
  const m = after.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = deepEqual(before[i], after[j])
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (deepEqual(before[i], after[j])) {
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      changes.push({ path: `${path}[${i}]`, type: 'removed', before: before[i] });
      i += 1;
    } else {
      changes.push({ path: `${path}[${j}]`, type: 'added', after: after[j] });
      j += 1;
    }
  }
  while (i < n) {
    changes.push({ path: `${path}[${i}]`, type: 'removed', before: before[i] });
    i += 1;
  }
  while (j < m) {
    changes.push({ path: `${path}[${j}]`, type: 'added', after: after[j] });
    j += 1;
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

/**
 * 由 JSON 值生成 TypeScript 接口。
 * 数组取首个元素推断元素类型（空数组输出 unknown[]）；
 * 对象命名规则：根为 rootName，嵌套按父名+字段名（数组元素追加 Item）。
 */
export function jsonToTsTypes(value: unknown, rootName = 'Root'): string {
  const interfaces = new Map<string, string>();
  const order: string[] = [];
  const nameByObject = new Map<object, string>();
  const usedNames = new Set<string>();

  const nextName = (base: string): string => {
    let name = base;
    let index = 2;
    while (usedNames.has(name)) {
      name = `${base}${index}`;
      index += 1;
    }
    usedNames.add(name);
    return name;
  };

  const typeOf = (current: unknown, nameHint: string): string => {
    if (current === null) return 'null';
    if (Array.isArray(current)) {
      if (current.length === 0) return 'unknown[]';
      return `${typeOf(current[0], `${nameHint}Item`)}[]`;
    }
    switch (typeof current) {
      case 'string':
        return 'string';
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'object': {
        const record = current as Record<string, unknown>;
        const existing = nameByObject.get(record);
        if (existing) return existing;
        const name = nextName(nameHint);
        nameByObject.set(record, name);
        order.push(name);
        const fields = Object.entries(record)
          .map(([key, fieldValue]) => {
            const safeKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
              ? key
              : JSON.stringify(key);
            const fieldName = `${name}${capitalize(key)}`;
            return `  ${safeKey}: ${typeOf(fieldValue, fieldName)};`;
          })
          .join('\n');
        interfaces.set(name, `export interface ${name} {\n${fields}\n}`);
        return name;
      }
      default:
        return 'unknown';
    }
  };

  typeOf(value, rootName);
  return order.map((name) => interfaces.get(name)).join('\n\n');
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}
