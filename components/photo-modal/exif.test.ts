import { afterEach, describe, expect, it, vi } from 'vitest';
import exifr from 'exifr';
import { formatExifData, parsePhotoExif } from './exif';

vi.mock('exifr', () => ({
  default: { parse: vi.fn() },
}));

describe('photo EXIF parsing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats camera fields and extracts the captured year', () => {
    const result = formatExifData({
      Make: 'Canon',
      Model: 'EOS R5',
      LensModel: 'RF 50mm',
      FNumber: 2.8,
      ExposureTime: 1 / 125,
      ISO: 400,
      DateTimeOriginal: new Date('2022-06-08T12:00:00Z'),
      Artist: '摄影师',
      State: '广东',
      City: '深圳',
      Country: '中国',
    });

    expect(result).toEqual({
      year: 2022,
      exif: expect.objectContaining({
        camera: 'Canon EOS R5',
        lens: 'RF 50mm',
        aperture: 'f/2.8',
        shutterSpeed: '1/125s',
        iso: 'ISO 400',
        author: '摄影师',
        province: '广东',
        city: '深圳',
        country: '中国',
      }),
    });
  });

  it('returns empty EXIF data when the file has no metadata', async () => {
    vi.mocked(exifr.parse).mockResolvedValue(undefined);

    await expect(parsePhotoExif(new File(['image'], 'empty.jpg', { type: 'image/jpeg' })))
      .resolves.toEqual({ exif: {} });
  });

  it('keeps parsing failures non-blocking', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(exifr.parse).mockRejectedValue(new Error('bad metadata'));

    await expect(parsePhotoExif(new File(['image'], 'broken.jpg', { type: 'image/jpeg' })))
      .resolves.toEqual({ exif: {} });
  });
});
