import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateFilePath, normalizePublicUrl, putTencentProcessedImages, validateTencentPublicUrl } from './oss';
import type { OSSConfig } from './config';

describe('storage paths', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('organizes OSS uploads by month without a day directory', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T08:30:00Z'));

    expect(generateFilePath('photo.jpg')).toMatch(/^fluent_gallery\/photos\/2026\/09\/[^/]+\.jpg$/);
    expect(generateFilePath('photo.webp', 'thumbs', '/portfolio//')).toMatch(/^portfolio\/thumbs\/2026\/09\/[^/]+\.webp$/);
  });
});

describe('Tencent CI image processing', () => {
  const config: OSSConfig = {
    provider: 'tencent', uploadDir: 'fluent_gallery', cloudImageProcessing: true, publicUrl: 'https://media.hwangzhun.com',
    region: 'ap-hongkong', bucket: 'gallery-123456', accessKeyId: 'id', accessKeySecret: 'secret',
  };

  it('normalizes a bare custom domain and rejects paths', () => {
    expect(normalizePublicUrl('media.hwangzhun.com/')).toBe('https://media.hwangzhun.com');
    expect(() => normalizePublicUrl('https://media.hwangzhun.com/photos')).toThrow('不能包含路径');
    expect(() => normalizePublicUrl('http://media.hwangzhun.com')).toThrow('HTTPS');
  });

  it('uploads once with two combined resize and AVIF rules', async () => {
    let params: any;
    const client = {
      putObject: vi.fn(async (input: any) => {
        params = input;
        const operations = JSON.parse(input.PicOperations);
        const displayKey = operations.rules[0].fileid.replace(/^\//, '');
        const thumbnailKey = operations.rules[1].fileid.replace(/^\//, '');
        return { UploadResult: { ProcessResults: { Object: [
          { Key: displayKey, Location: `default.example/${displayKey}`, Format: 'AVIF', Width: '2560', Height: '1707', Size: '120000' },
          { Key: thumbnailKey, Location: `default.example/${thumbnailKey}`, Format: 'AVIF', Width: '720', Height: '480', Size: '18000' },
        ] } } };
      }),
      deleteObject: vi.fn(),
    } as any;

    const result = await putTencentProcessedImages(client, { buffer: Buffer.from('jpeg'), mimetype: 'image/jpeg', size: 4 }, config);
    expect(client.putObject).toHaveBeenCalledTimes(1);
    const operations = JSON.parse(params.PicOperations);
    expect(operations.rules).toHaveLength(2);
    expect(operations.rules[0].fileid).toBe(`/${params.Key}`);
    expect(operations.rules[1].fileid).toMatch(/^\/fluent_gallery\/thumbs\//);
    for (const item of operations.rules) {
      expect(item.rule).toContain('/thumbnail/');
      expect(item.rule).toContain('/format/avif');
      expect(item.rule).toContain('/auto-orient');
    }
    expect(result).toMatchObject({
      url: expect.stringMatching(/^https:\/\/media\.hwangzhun\.com\/fluent_gallery\/photos\//),
      thumbnailUrl: expect.stringMatching(/^https:\/\/media\.hwangzhun\.com\/fluent_gallery\/thumbs\//),
      objectKey: params.Key,
      thumbnailObjectKey: operations.rules[1].fileid.slice(1),
      width: 2560, height: 1707, displayBytes: 120000, thumbnailBytes: 18000,
    });
  });

  it('cleans both possible outputs when Tencent returns an incomplete result', async () => {
    const client = {
      putObject: vi.fn(async () => ({ UploadResult: { ProcessResults: { Object: [] } } })),
      deleteObject: vi.fn(async () => ({})),
    } as any;
    await expect(putTencentProcessedImages(client, { buffer: Buffer.from('jpeg'), mimetype: 'image/jpeg', size: 4 }, config)).rejects.toThrow('完整的 AVIF');
    expect(client.deleteObject).toHaveBeenCalledTimes(2);
  });

  it('accepts an enabled REST domain that reaches COS even when the root is forbidden', async () => {
    const client = { getBucketDomain: vi.fn(async () => ({ DomainRule: [{ Name: 'media.hwangzhun.com', Type: 'REST', Status: 'ENABLED' }] })) } as any;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403, headers: { 'x-cos-request-id': 'request-id' } })));
    await expect(validateTencentPublicUrl(client, config)).resolves.toBe('https://media.hwangzhun.com');
  });

  it('rejects a domain that is not enabled for the current bucket', async () => {
    const client = { getBucketDomain: vi.fn(async () => ({ DomainRule: [{ Name: 'media.hwangzhun.com', Type: 'REST', Status: 'DISABLED' }] })) } as any;
    await expect(validateTencentPublicUrl(client, config)).rejects.toThrow('未在当前腾讯云 Bucket');
  });
});
