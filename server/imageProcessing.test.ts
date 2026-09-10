import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { processUploadedImage } from './imageProcessing';

async function file(width: number, height: number, format: 'jpeg' | 'png' | 'webp' = 'jpeg') {
  const buffer = await sharp({ create: { width, height, channels: 4, background: { r: 90, g: 130, b: 80, alpha: .65 } } }).toFormat(format).toBuffer();
  return { buffer, mimetype: `image/${format}`, originalname: `sample.${format === 'jpeg' ? 'jpg' : format}` };
}

describe('processUploadedImage', () => {
  it('creates separate WebP display and thumbnail images without changing aspect ratio', async () => {
    const result = await processUploadedImage(await file(3000, 2000));
    expect([result.width, result.height]).toEqual([2560, 1707]);
    expect((await sharp(result.display).metadata()).format).toBe('webp');
    const thumb = await sharp(result.thumbnail).metadata();
    expect([thumb.width, thumb.height]).toEqual([720, 480]);
  });

  it('does not enlarge a small transparent image', async () => {
    const result = await processUploadedImage(await file(400, 600, 'png'));
    expect([result.width, result.height]).toEqual([400, 600]);
    const thumb = await sharp(result.thumbnail).metadata();
    expect([thumb.width, thumb.height]).toEqual([400, 600]);
    expect(thumb.hasAlpha).toBe(true);
  });
});
