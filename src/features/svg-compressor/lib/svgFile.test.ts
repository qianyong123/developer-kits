import { describe, expect, it } from 'vitest';
import { svgOutputName } from './svgFile';

describe('svgOutputName', () => {
  it('格式不变且未设置规则时保留原文件名', () => {
    expect(svgOutputName('icon.svg', 'svg')).toBe('icon.svg');
    expect(svgOutputName('icon.svgz', 'svgz')).toBe('icon.svgz');
  });

  it('格式转换且未设置规则时仅更换扩展名', () => {
    expect(svgOutputName('icon.svg', 'svgz')).toBe('icon.svgz');
    expect(svgOutputName('icon.svgz', 'svg')).toBe('icon.svg');
  });

  it('默认规则：追加 -compressed 后缀', () => {
    expect(svgOutputName('icon.svg', 'svg', '', '-compressed')).toBe('icon-compressed.svg');
    expect(svgOutputName('icon.svg', 'svgz', '', '-compressed')).toBe('icon-compressed.svgz');
  });

  it('仅设置前缀时按 前缀+原名 生成', () => {
    expect(svgOutputName('icon.svg', 'svg', 'min-', '')).toBe('min-icon.svg');
  });

  it('同时设置前后缀且格式转换时正确拼接', () => {
    expect(svgOutputName('icon.svg', 'svgz', 'min-', '-v2')).toBe('min-icon-v2.svgz');
  });
});
