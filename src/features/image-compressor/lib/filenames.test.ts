import { describe, expect, it } from 'vitest';
import { outputFileName } from './filenames';

describe('outputFileName', () => {
  it('格式不变且未设置规则时保留原文件名', () => {
    expect(outputFileName('photo.jpg', 'jpeg')).toBe('photo.jpg');
  });

  it('格式转换且未设置规则时仅更换扩展名', () => {
    expect(outputFileName('photo.png', 'webp')).toBe('photo.webp');
  });

  it('jpeg 与 jpg 视为同格式，保留原名', () => {
    expect(outputFileName('photo.JPG', 'jpeg')).toBe('photo.JPG');
  });

  it('默认规则：追加 -compressed 后缀', () => {
    expect(outputFileName('photo.jpg', 'jpeg', '', '-compressed')).toBe('photo-compressed.jpg');
  });

  it('仅设置前缀时按 前缀+原名 生成', () => {
    expect(outputFileName('photo.jpg', 'jpeg', 'min-', '')).toBe('min-photo.jpg');
  });

  it('同时设置前后缀且格式转换时正确拼接', () => {
    expect(outputFileName('photo.png', 'webp', 'min-', '-v2')).toBe('min-photo-v2.webp');
  });

  it('原文件名无扩展名时也能正确命名', () => {
    expect(outputFileName('photo', 'webp', '', '-compressed')).toBe('photo-compressed.webp');
  });
});
