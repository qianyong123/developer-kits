import { describe, expect, it } from 'vitest';
import { formatCreatedAt } from './formatDate';

describe('formatCreatedAt', () => {
  it('格式化 ISO 时间为 YYYY-MM-DD HH:mm', () => {
    expect(formatCreatedAt('2026-08-13T10:05:09.000Z')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('缺失或非法输入返回 --', () => {
    expect(formatCreatedAt()).toBe('--');
    expect(formatCreatedAt('not-a-date')).toBe('--');
  });
});
