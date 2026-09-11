import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateFilePath } from './oss';

describe('storage paths', () => {
  afterEach(() => vi.useRealTimers());

  it('organizes OSS uploads by month without a day directory', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T08:30:00Z'));

    expect(generateFilePath('photo.jpg')).toMatch(/^photos\/2026\/09\/[^/]+\.jpg$/);
    expect(generateFilePath('photo.webp', 'thumbs')).toMatch(/^thumbs\/2026\/09\/[^/]+\.webp$/);
  });
});
