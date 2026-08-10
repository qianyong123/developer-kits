import { describe, expect, it } from 'vitest';
import {
  diffJson,
  errorContext,
  findDuplicateKeys,
  formatDiffReport,
  formatJson,
  jsonToTsTypes,
  minifyJson,
  offsetToLineCol,
  offsetFromLineCol,
  parseJson,
  parseJsonStrict,
  shortValue,
  sortObjectKeys,
  unwrapJsonString,
  validateJson,
} from '@/features/json-tools/lib/json';

describe('parseJson', () => {
  it('解析合法 JSON', () => {
    expect(parseJson('{"a":1}').ok).toBe(true);
  });

  it('空输入视为错误', () => {
    const result = parseJson('   ');
    expect(result.ok).toBe(false);
  });

  it('语法错误返回行列定位', () => {
    const result = parseJson('{\n  "a": 1,\n  "b": }\n}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.line).toBe(3);
      expect(result.error.column).toBeGreaterThan(0);
    }
  });
});

describe('formatJson / minifyJson', () => {
  it('格式化保留缩进', () => {
    const result = formatJson('{"a":[1,2],"b":{"c":true}}', { indent: 2 });
    expect(result.ok && result.text).toContain('\n  "a"');
  });

  it('压缩去掉空白', () => {
    const result = minifyJson('{ "a" : [ 1, 2 ] }');
    expect(result.ok && result.text).toBe('{"a":[1,2]}');
  });

  it('sortKeys 按字典序排序键', () => {
    const sorted = sortObjectKeys({ b: 1, a: { d: 2, c: 3 }, z: [4, 5] });
    expect(JSON.stringify(sorted)).toBe('{"a":{"c":3,"d":2},"b":1,"z":[4,5]}');
  });

  it('非法输入返回错误', () => {
    const result = formatJson('{oops}');
    expect(result.ok).toBe(false);
  });
});

describe('validateJson / findDuplicateKeys', () => {
  it('合法无重复键', () => {
    const result = validateJson('{"a":1,"b":2}');
    expect(result.ok).toBe(true);
    expect(result.duplicates).toHaveLength(0);
  });

  it('检测重复键并给出两次出现的行号', () => {
    const result = validateJson('{\n  "a": 1,\n  "a": 2\n}');
    expect(result.ok).toBe(true);
    expect(result.duplicates).toEqual([{ key: 'a', firstLine: 2, secondLine: 3 }]);
  });

  it('数组与嵌套对象中的字符串键不误报', () => {
    const duplicates = findDuplicateKeys('{"a":[{"a":1}],"b":"a"}');
    expect(duplicates).toHaveLength(0);
  });

  it('非法 JSON 返回错误而非重复键', () => {
    const result = validateJson('{"a":}');
    expect(result.ok).toBe(false);
  });
});

describe('diffJson', () => {
  it('完全一致无变更', () => {
    expect(diffJson({ a: 1 }, { a: 1 })).toHaveLength(0);
  });

  it('标量修改', () => {
    const changes = diffJson({ a: 1 }, { a: 2 });
    expect(changes).toEqual([{ path: '$.a', type: 'changed', before: 1, after: 2 }]);
  });

  it('对象键新增与删除', () => {
    const changes = diffJson({ a: 1 }, { b: 2 });
    expect(changes).toContainEqual({ path: '$.a', type: 'removed', before: 1 });
    expect(changes).toContainEqual({ path: '$.b', type: 'added', after: 2 });
  });

  it('数组尾部新增按 LCS 对齐', () => {
    const changes = diffJson([1, 2], [1, 2, 3]);
    expect(changes).toEqual([{ path: '$[2]', type: 'added', after: 3 }]);
  });

  it('数组按同一下标对比：中间插入显示为修改+新增', () => {
    const changes = diffJson([1, 3], [1, 2, 3]);
    expect(changes).toEqual([
      { path: '$[1]', type: 'changed', before: 3, after: 2 },
      { path: '$[2]', type: 'added', after: 3 },
    ]);
  });

  it('数组等长时按索引对比，重排显示为修改', () => {
    const changes = diffJson([1, 2, 3], [1, 3, 2]);
    expect(changes).toEqual([
      { path: '$[1]', type: 'changed', before: 2, after: 3 },
      { path: '$[2]', type: 'changed', before: 3, after: 2 },
    ]);
  });

  it('数组等长时对象元素按字段对比', () => {
    const changes = diffJson(
      [{ name: '张三', active: true }],
      [{ name: '张三', active: false }],
    );
    expect(changes).toEqual([
      { path: '$[0].active', type: 'changed', before: true, after: false },
    ]);
  });

  it('嵌套路径与特殊键名', () => {
    const changes = diffJson({ 'a.b': { list: [1] } }, { 'a.b': { list: [1, 2] } });
    expect(changes).toEqual([
      { path: '$["a.b"].list[1]', type: 'added', after: 2 },
    ]);
  });

  it('类型变化记为修改', () => {
    const changes = diffJson({ a: '1' }, { a: 1 });
    expect(changes).toEqual([{ path: '$.a', type: 'changed', before: '1', after: 1 }]);
  });

  it('对象与数组类型变化记为修改', () => {
    const changes = diffJson({ a: [1] }, { a: { x: 1 } });
    expect(changes).toEqual([
      { path: '$.a', type: 'changed', before: [1], after: { x: 1 } },
    ]);
  });

  it('数组元素对象与标量类型变化记为修改', () => {
    const changes = diffJson([{ a: 1 }], ['str']);
    expect(changes).toEqual([
      { path: '$[0]', type: 'changed', before: { a: 1 }, after: 'str' },
    ]);
  });

  it('数组元素数组与对象类型变化记为修改', () => {
    const changes = diffJson([[]], [{}]);
    expect(changes).toEqual([{ path: '$[0]', type: 'changed', before: [], after: {} }]);
  });
});

describe('工具函数', () => {
  it('unwrapJsonString：字符串内套 JSON 自动解包', () => {
    expect(unwrapJsonString('{"a":1}')).toEqual({ a: 1 });
    expect(unwrapJsonString('hello')).toBe('hello');
    expect(unwrapJsonString(123)).toBe(123);
  });

  it('formatJson 开启解包后输出内层对象', () => {
    const result = formatJson('"{\\"a\\":1}"', { indent: 2, unwrapString: true });
    expect(result.ok && result.text).toBe('{\n  "a": 1\n}');
  });

  it('validateJson 解包后校验内层重复键', () => {
    const result = validateJson('"{\\"a\\":1,\\"a\\":2}"', { unwrapString: true });
    expect(result.ok).toBe(true);
    expect(result.duplicates).toHaveLength(1);
  });

  it('validateJson 解包后内层非法则报错', () => {
    const result = validateJson('"{bad}"', { unwrapString: true });
    expect(result.ok).toBe(false);
  });

  it('宽松模式解析 JSONC（注释/尾逗号/无引号键）', () => {
    const result = formatJson('{ a: 1, // 注释\n  b: "x", }', { lenient: true });
    expect(result.ok && result.text).toBe('{\n  "a": 1,\n  "b": "x"\n}');
  });

  it('宽松模式下严格输入同样可用', () => {
    const result = minifyJson('{"a":1}', { lenient: true });
    expect(result.ok && result.text).toBe('{"a":1}');
  });

  it('jsonToTsTypes 生成嵌套接口', () => {
    const types = jsonToTsTypes({
      name: '开发工具包',
      count: 3,
      active: true,
      stats: { downloads: 1234 },
      tools: [{ id: 1 }, { id: 2 }],
      extra: null,
    });
    expect(types).toContain('export interface Root {');
    expect(types).toContain('name: string;');
    expect(types).toContain('stats: RootStats;');
    expect(types).toContain('export interface RootStats {');
    expect(types).toContain('tools: RootToolsItem[];');
    expect(types).toContain('export interface RootToolsItem {');
    expect(types).toContain('extra: null;');
  });

  it('超出 2^53 的大整数被标记', () => {
    const result = parseJsonStrict('{"a": 9007199254740993}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bigNumbers).toEqual([
        { line: 1, column: 7, raw: '9007199254740993' },
      ]);
    }
  });

  it('安全整数与小数不误报', () => {
    const result = parseJsonStrict('{"a": 9007199254740991, "b": 1.5}');
    expect(result.ok && result.bigNumbers).toHaveLength(0);
  });

  it('validateJson 携带大数信息', () => {
    const result = validateJson('{"a": 12345678901234567890}');
    expect(result.ok).toBe(true);
    expect(result.bigNumbers).toHaveLength(1);
  });

  it('offsetToLineCol 换算行列', () => {
    expect(offsetToLineCol('ab\ncd\nef', 5)).toEqual({ line: 2, column: 3 });
  });

  it('offsetFromLineCol 与 offsetToLineCol 互逆', () => {
    const text = 'ab\ncd\nef';
    expect(offsetFromLineCol(text, 2, 3)).toBe(5);
    expect(offsetToLineCol(text, offsetFromLineCol(text, 3, 2))).toEqual({ line: 3, column: 2 });
  });

  it('errorContext 截取报错位置前后片段', () => {
    const ctx = errorContext('{"a": 1, "b": }', { message: 'x', offset: 14 });
    expect(ctx).not.toBeNull();
    expect(ctx!.before).toBe('{"a": 1, "b": ');
    expect(ctx!.after[0]).toBe('}');
    expect(ctx!.hasAfter).toBe(false);
  });

  it('errorContext 无 offset 时按行列反算', () => {
    const text = '{\n  "a": 1,\n  "b": \n}';
    const ctx = errorContext(text, { message: 'x', line: 3, column: 8 }, 8);
    expect(ctx).not.toBeNull();
    expect(ctx!.before).toContain('"b"');
  });

  it('errorContext 换行显示为可见符号', () => {
    const ctx = errorContext('{"a":\n1}', { message: 'x', offset: 5 }, 10);
    expect(ctx!.after).toContain('↵');
  });

  it('shortValue 截断超长值', () => {
    expect(shortValue('x'.repeat(100), 10)).toBe(`"${'x'.repeat(9)}…`);
  });

  it('formatDiffReport 输出可读报告', () => {
    const report = formatDiffReport([
      { path: '$.a', type: 'changed', before: 1, after: 2 },
      { path: '$.b', type: 'added', after: { x: 1 } },
    ]);
    expect(report).toBe('~ a: 1 → 2\n+ b: {"x":1}');
  });
});
