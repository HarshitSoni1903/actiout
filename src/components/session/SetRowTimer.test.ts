import { describe, expect, it } from 'vitest';
import { formatDuration } from './SetRowTimer';

describe('formatDuration', () => {
  it('formats zero seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats sub-minute durations', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('formats exactly one minute', () => {
    expect(formatDuration(60)).toBe('1:00');
  });

  it('zero-pads seconds over a minute', () => {
    expect(formatDuration(90)).toBe('1:30');
  });

  it('formats multi-minute durations', () => {
    expect(formatDuration(605)).toBe('10:05');
  });
});
