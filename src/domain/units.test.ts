import { describe, expect, it } from 'vitest';
import { convertWeight, formatWeight } from './units';

describe('convertWeight', () => {
  it('converts 100 lb to kg (≈ 45.359237, within 1e-9)', () => {
    expect(Math.abs(convertWeight(100, 'lb', 'kg') - 45.359237)).toBeLessThan(1e-9);
  });

  it('round-trips lb -> kg -> lb within 1e-9', () => {
    const original = 137.5;
    const roundTripped = convertWeight(convertWeight(original, 'lb', 'kg'), 'kg', 'lb');
    expect(Math.abs(roundTripped - original)).toBeLessThan(1e-9);
  });

  it('is identity when converting to the same unit', () => {
    expect(convertWeight(83.2, 'lb', 'lb')).toBe(83.2);
    expect(convertWeight(83.2, 'kg', 'kg')).toBe(83.2);
  });
});

describe('formatWeight', () => {
  it('formats whole lb values without a decimal', () => {
    expect(formatWeight(135, 'lb')).toBe('135 lb');
  });

  it('formats kg values with at most 1 decimal, trimming trailing zero', () => {
    expect(formatWeight(61.23, 'kg')).toBe('61.2 kg');
  });
});
