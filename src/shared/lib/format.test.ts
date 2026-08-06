import { describe, expect, it } from 'vitest';
import { ratioPercent } from './format';

describe('ratioPercent', () => {
  it('shows a minus sign when the result is smaller', () => {
    expect(ratioPercent(1000, 800)).toBe('-20.0%');
  });

  it('shows a plus sign when the result is larger', () => {
    expect(ratioPercent(716, 882)).toBe('+23.2%');
  });

  it('shows 0.0% when sizes are equal', () => {
    expect(ratioPercent(1000, 1000)).toBe('0.0%');
  });
});
