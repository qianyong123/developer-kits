/**
 * JSON 结构对比：递归比较两棵树，输出按路径拆分的 新增/删除/修改 清单。
 * 数组对比策略：
 * - 对象数组存在公共键（优先 id/key/name）时按键匹配，避免插入元素导致后续全部误报修改；
 * - 标量数组使用 LCS 对齐，识别真实的插入/删除；
 * - 其余场景回退为按下标对齐。
 */

export interface JsonChange {
  path: string;
  type: 'added' | 'removed' | 'changed';
  before?: unknown;
  after?: unknown;
}

export function diffJson(before: unknown, after: unknown): JsonChange[] {
  try {
    const changes: JsonChange[] = [];
    walk(before, after, '$', changes);
    return changes;
  } catch (err) {
    // 深层嵌套超出调用栈：整体记为一次修改，避免页面崩溃
    if (err instanceof RangeError) return [{ path: '$', type: 'changed', before, after }];
    throw err;
  }
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

function arrayDiff(
  before: unknown[],
  after: unknown[],
  path: string,
  changes: JsonChange[],
): void {
  const key = commonObjectKey(before, after);
  if (key !== null) {
    keyedArrayDiff(before, after, key, path, changes);
    return;
  }
  if (before.every(isScalarValue) && after.every(isScalarValue)) {
    lcsArrayDiff(before, after, path, changes);
    return;
  }
  indexArrayDiff(before, after, path, changes);
}

/** 对象数组的公共键：所有元素都含有的键，优先 id/key/name；无公共键返回 null。 */
function commonObjectKey(before: unknown[], after: unknown[]): string | null {
  const objects = [...before, ...after];
  if (objects.length === 0 || !objects.every(isPlainObject)) return null;
  const keys = new Set<string>();
  for (const item of objects) {
    for (const k of Object.keys(item as Record<string, unknown>)) keys.add(k);
  }
  const presentInAll = [...keys].filter((k) =>
    objects.every((item) => k in (item as Record<string, unknown>)),
  );
  if (presentInAll.length === 0) return null;
  const preferred = ['id', 'key', 'name'];
  for (const p of preferred) {
    if (presentInAll.includes(p)) return p;
  }
  return presentInAll[0];
}

/** 按公共键匹配对象数组；路径沿用下标（after 下标），便于报告定位。 */
function keyedArrayDiff(
  before: unknown[],
  after: unknown[],
  key: string,
  path: string,
  changes: JsonChange[],
): void {
  const beforeMap = new Map<string, { item: unknown; index: number }>();
  before.forEach((item, index) => {
    const record = item as Record<string, unknown>;
    const k = String(record[key]);
    if (!beforeMap.has(k)) beforeMap.set(k, { item, index });
  });
  const matched = new Set<string>();
  after.forEach((item, index) => {
    if (!isPlainObject(item)) {
      changes.push({ path: `${path}[${index}]`, type: 'added', after: item });
      return;
    }
    const k = String((item as Record<string, unknown>)[key]);
    const target = beforeMap.get(k);
    if (target) {
      matched.add(k);
      walk(target.item, item, `${path}[${index}]`, changes);
    } else {
      changes.push({ path: `${path}[${index}]`, type: 'added', after: item });
    }
  });
  beforeMap.forEach(({ item, index }, k) => {
    if (!matched.has(k)) changes.push({ path: `${path}[${index}]`, type: 'removed', before: item });
  });
}

/** 标量数组 LCS 对齐：插入/删除不再让后续元素全部误报为修改。 */
function lcsArrayDiff(
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
      dp[i][j] =
        before[i] === after[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
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

/** 回退策略：始终按同一下标对齐比较。 */
function indexArrayDiff(
  before: unknown[],
  after: unknown[],
  path: string,
  changes: JsonChange[],
): void {
  const n = before.length;
  const m = after.length;
  for (let i = 0; i < Math.max(n, m); i += 1) {
    const pathAtIndex = `${path}[${i}]`;
    if (i >= n) {
      changes.push({ path: pathAtIndex, type: 'added', after: after[i] });
    } else if (i >= m) {
      changes.push({ path: pathAtIndex, type: 'removed', before: before[i] });
    } else {
      walk(before[i], after[i], pathAtIndex, changes);
    }
  }
}

function isScalarValue(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    return aKeys.every((key) => key in bRecord && deepEqual(aRecord[key], bRecord[key]));
  }
  return false;
}

function joinPath(path: string, key: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) return `${path}.${key}`;
  return `${path}[${JSON.stringify(key)}]`;
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
      const path = change.path.replace(/^\$\.?/, '');
      // 报告/复制输出完整值，不做截断，避免复制后内容缺失
      const before = change.before === undefined ? 'undefined' : JSON.stringify(change.before);
      const after = change.after === undefined ? 'undefined' : JSON.stringify(change.after);
      if (change.type === 'added') return `+ ${path}: ${after}`;
      if (change.type === 'removed') return `- ${path}: ${before}`;
      return `~ ${path}: ${before} → ${after}`;
    })
    .join('\n');
}
