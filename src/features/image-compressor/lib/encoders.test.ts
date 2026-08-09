import { describe, expect, it } from 'vitest';
import { resolveOutputFormat } from '@/features/image-compressor/lib/encoders';

const makeFile = (type: string) => new File(['x'], `test.${type.split('/')[1]}`, { type });

describe('resolveOutputFormat', () => {
  it('keeps the original format by default', () => {
    expect(resolveOutputFormat(makeFile('image/jpeg'), 'original')).toBe('jpeg');
    expect(resolveOutputFormat(makeFile('image/png'), 'original')).toBe('png');
    expect(resolveOutputFormat(makeFile('image/webp'), 'original')).toBe('webp');
  });

  it('maps gif and bmp to png', () => {
    expect(resolveOutputFormat(makeFile('image/gif'), 'original')).toBe('png');
    expect(resolveOutputFormat(makeFile('image/bmp'), 'original')).toBe('png');
  });

  it('respects an explicit format choice', () => {
    expect(resolveOutputFormat(makeFile('image/png'), 'webp')).toBe('webp');
    expect(resolveOutputFormat(makeFile('image/jpeg'), 'png')).toBe('png');
  });
});
