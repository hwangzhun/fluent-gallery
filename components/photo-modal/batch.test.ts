import { describe, expect, it } from 'vitest';
import { getFileKey, getPhotoTitle, isPhotoFormValid, runWithConcurrency, updatePhotoFormField } from './batch';

describe('batch upload helpers', () => {
  it('builds stable file keys and keeps the existing title rule', () => {
    const selected = new File(['image'], 'summer.trip.jpg', { type: 'image/jpeg', lastModified: 42 });
    expect(getFileKey(selected)).toBe('summer.trip.jpg:5:image/jpeg:42');
    expect(getPhotoTitle(selected)).toBe('summer');
  });

  it('updates top-level and nested fields without mutating the original form', () => {
    const original = { title: 'One', year: 2026, tags: '', exif: { city: '香港' } };
    const titled = updatePhotoFormField(original, 'title', 'Shared');
    const located = updatePhotoFormField(titled, 'exif.city', '深圳');

    expect(original).toEqual({ title: 'One', year: 2026, tags: '', exif: { city: '香港' } });
    expect(located).toEqual({ title: 'Shared', year: 2026, tags: '', exif: { city: '深圳' } });
    expect(isPhotoFormValid(located)).toBe(true);
    expect(isPhotoFormValid({ ...located, title: ' ' })).toBe(false);
  });

  it('never runs more than three upload tasks concurrently', async () => {
    let active = 0;
    let peak = 0;

    await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
    });

    expect(peak).toBe(3);
  });
});
