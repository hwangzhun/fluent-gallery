import { describe, expect, it, vi } from 'vitest';
import { PhotoUploadService } from './photoUploadService';

const dbPhoto = {
  id: 'photo-1', url: '/photos/sample.webp', thumbnail_url: '/thumbs/sample.webp', title: 'Sample', description: null,
  tags: ['night', 'travel'], year: 2026, width: 1200, height: 800, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', exif: null,
};
const input = { file: new File(['image'], 'sample.jpg', { type: 'image/jpeg' }), title: 'Sample', year: 2026, tags: 'travel, night, travel', exif: { camera: 'Canon' } };

describe('PhotoUploadService', () => {
  it('sends the file and normalized metadata to the processed upload endpoint', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: dbPhoto }) } as Response);
    const result = await new PhotoUploadService({ apiFetch }).uploadPhoto(input);
    expect(result).toMatchObject({ id: 'photo-1', url: '/photos/sample.webp', thumbnailUrl: '/thumbs/sample.webp' });
    expect(apiFetch).toHaveBeenCalledWith('/photos/upload', { method: 'POST', body: expect.any(FormData) });
    const body = apiFetch.mock.calls[0][1].body as FormData;
    expect(body.get('file')).toBe(input.file);
    expect(JSON.parse(String(body.get('metadata')))).toEqual({ title: 'Sample', year: 2026, tags: ['travel', 'night'], exif: { camera: 'Canon' } });
  });

  it('surfaces the server error', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false, error: '图片像素超过限制' }) } as Response);
    await expect(new PhotoUploadService({ apiFetch }).uploadPhoto(input)).rejects.toThrow('图片像素超过限制');
  });
});
