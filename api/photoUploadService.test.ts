import { describe, expect, it, vi } from 'vitest';
import { PhotoUploadService } from './photoUploadService';

const dbPhoto = {
  id: 'photo-1', url: '/photos/sample.webp', thumbnail_url: '/thumbs/sample.webp', title: 'Sample', description: null,
  tags: ['night', 'travel'], year: 2026, width: 1200, height: 800, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', exif: null,
};
const input = { file: new File(['image'], 'sample.jpg', { type: 'image/jpeg' }), title: 'Sample', year: 2026, tags: 'travel, night, travel', exif: { camera: 'Canon' } };

describe('PhotoUploadService', () => {
  it('sends the file and normalized metadata to the processed upload endpoint', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { direct: false } }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: dbPhoto }) } as Response);
    const result = await new PhotoUploadService({ apiFetch }).uploadPhoto(input);
    expect(result).toMatchObject({ id: 'photo-1', url: '/photos/sample.webp', thumbnailUrl: '/thumbs/sample.webp' });
    expect(apiFetch).toHaveBeenCalledWith('/photos/upload', { method: 'POST', body: expect.any(FormData) });
    const body = apiFetch.mock.calls[1][1].body as FormData;
    expect(body.get('file')).toBe(input.file);
    expect(JSON.parse(String(body.get('metadata')))).toEqual({ title: 'Sample', year: 2026, tags: ['travel', 'night'], exif: { camera: 'Canon' } });
  });

  it('surfaces the server error', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false, error: '图片像素超过限制' }) } as Response);
    await expect(new PhotoUploadService({ apiFetch }).uploadPhoto(input)).rejects.toThrow('图片像素超过限制');
  });

  it('waits for a durable direct-upload job before reporting success', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { direct: true, uploadUrl: '/signed', sourceObjectKey: 'gallery/incoming/source.jpg', mime: 'image/jpeg' } }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { jobId: 'job-1', status: 'queued' } }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: [{ id: 'job-1', photoId: 'photo-job-1', status: 'completed', error: null }] }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { ...dbPhoto, id: 'photo-job-1' } }) } as Response);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as typeof fetch;
    try {
      const service = new PhotoUploadService({ apiFetch });
      await expect(service.uploadPhoto(input)).resolves.toMatchObject({ id: 'photo-job-1' });
      expect(apiFetch).toHaveBeenNthCalledWith(3, '/photos/upload-jobs/status', expect.objectContaining({ method: 'POST', body: JSON.stringify({ ids: ['job-1'] }) }));
      expect(apiFetch).toHaveBeenLastCalledWith('/photos/photo-job-1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('surfaces the final processing error instead of reporting completion', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { direct: true, uploadUrl: '/signed', sourceObjectKey: 'gallery/incoming/broken.jpg', mime: 'image/jpeg' } }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { jobId: 'job-failed', status: 'queued' } }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: [{ id: 'job-failed', photoId: 'photo-job-failed', status: 'failed', error: '图片解码失败' }] }) } as Response);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as typeof fetch;
    try {
      await expect(new PhotoUploadService({ apiFetch }).uploadPhoto(input)).rejects.toThrow('图片解码失败');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
