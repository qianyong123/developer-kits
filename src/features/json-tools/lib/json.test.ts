import { describe, expect, it } from 'vitest';
import {
  diffJson,
  findDuplicateKeys,
  formatDiffReport,
  formatJson,
  minifyJson,
  offsetToLineCol,
  parseJson,
  shortValue,
  sortObjectKeys,
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
    const result = formatJson('{"a":[1,2],"b":{"c":true}}', 2);
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

  it('数组按索引对比', () => {
    const changes = diffJson([1, 2], [1, 2, 3]);
    expect(changes).toEqual([{ path: '$[2]', type: 'added', after: 3 }]);
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
});

describe('工具函数', () => {
  it('offsetToLineCol 换算行列', () => {
    expect(offsetToLineCol('ab\ncd\nef', 5)).toEqual({ line: 2, column: 3 });
  });

  it('shortValue 截断超长值', () => {
    expect(shortValue('x'.repeat(100), 10)).toBe(`"${'x'.repeat(9)}…`);
  });

  it('formatDiffReport 输出可读报告', () => {
    const report = formatDiffReport([
      { path: '$.a', type: 'changed', before: 1, after: 2 },
      { path: '$.b', type: 'added', after: { x: 1 } },
    ]);
    expect(report).toBe('$.a: 1 → 2\n$.b: + {"x":1}');
  });
});
