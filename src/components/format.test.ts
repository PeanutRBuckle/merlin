import { describe, it, expect } from 'vitest';
import { formatIsoDate } from './format';

describe('UTC display dates', () => {
  it('formats aggregate ISO timestamps rather than leaking machine timestamps into the UI', () => {
    expect(formatIsoDate('2024-01-01T22:00:00.000Z')).toBe('Jan 1, 2024');
    expect(formatIsoDate('2024-02-29')).toBe('Feb 29, 2024');
    expect(formatIsoDate('invalid')).toBe('invalid');
  });
});
