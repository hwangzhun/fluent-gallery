import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mocks = vi.hoisted(() => ({
  processUploadedImage: vi.fn(),
  storeProcessedImages: vi.fn(),
  deleteOSSFile: vi.fn(),
  getOSSClient: vi.fn(),
}));

vi.mock('./imageProcessing', () => ({ processUploadedImage: mocks.processUploadedImage }));
vi.mock('./storage/processed', () => ({ storeProcessedImages: mocks.storeProcessedImages }));
vi.mock('./storage/oss', () => ({
  deleteOSSFile: mocks.deleteOSSFile,
  getOSSClient: mocks.getOSSClient,
  putTencentProcessedObject: vi.fn(),
}));
vi.mock('./storage/config', () => ({
  loadStorageConfig: vi.fn().mockResolvedValue({ mode: 'oss', oss: { provider: 'aliyun', uploadDir: 'gallery' } }),
}));

const directory = mkdtempSync(join(tmpdir(), 'fluent-image-jobs-test-'));
process.env.GALLERY_DB_PATH = join(directory, 'gallery.db');
const { closeDatabase, dbGet, dbRun, initDatabase } = await import('../database/db');
const { PhotoDao } = await import('../database/dao/photoDao');
const { enqueueImageJob, getImageJobStatuses, startImageJobWorker, stopImageJobWorker } = await import('./imageJobs');
const photos = new PhotoDao();
const metadata = { title: '后台上传', year: 2026, tags: ['风景'] };

async function waitFor(predicate: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('等待图片任务超时');
}

beforeAll(initDatabase);
beforeEach(async () => {
  await dbRun('DELETE FROM image_jobs');
  await dbRun('DELETE FROM photos');
  mocks.processUploadedImage.mockReset().mockResolvedValue({ display: Buffer.from('display'), thumbnail: Buffer.from('thumb'), width: 1200, height: 800 });
  mocks.storeProcessedImages.mockReset().mockResolvedValue({ url: '/display.avif', thumbnailUrl: '/thumb.avif', objectKey: 'display/object.avif', thumbnailObjectKey: 'thumb/object.avif' });
  mocks.deleteOSSFile.mockReset().mockResolvedValue(undefined);
  mocks.getOSSClient.mockReset().mockResolvedValue({ get: vi.fn().mockResolvedValue({ content: Buffer.from('source') }) });
  await startImageJobWorker();
});
afterEach(stopImageJobWorker);
afterAll(async () => { await closeDatabase(); rmSync(directory, { recursive: true, force: true }); });

describe('durable image jobs', () => {
  it('publishes with a stable photo id and reports completion', async () => {
    const jobId = await enqueueImageJob('gallery/incoming/source.jpg', 'image/jpeg', metadata);
    await waitFor(async () => (await dbGet<{ status: string }>('SELECT status FROM image_jobs WHERE id = ?', [jobId]))?.status === 'completed');
    expect((await getImageJobStatuses([jobId]))[0]?.status).toBe('completed');
    expect(await photos.getPhotoById(`photo-${jobId}`)).toMatchObject({ title: '后台上传', url: '/display.avif' });
    expect(mocks.deleteOSSFile).toHaveBeenCalledWith('gallery/incoming/source.jpg');
  });

  it('keeps published display objects when source cleanup temporarily fails', async () => {
    mocks.deleteOSSFile.mockRejectedValue(new Error('OSS unavailable'));
    const jobId = await enqueueImageJob('gallery/incoming/cleanup.jpg', 'image/jpeg', metadata);
    await waitFor(async () => (await getImageJobStatuses([jobId]))[0]?.status === 'completed');
    expect(await photos.getPhotoById(`photo-${jobId}`)).toBeDefined();
    expect((await getImageJobStatuses([jobId]))[0]).toMatchObject({ status: 'completed' });
    expect(mocks.deleteOSSFile).not.toHaveBeenCalledWith('display/object.avif');
    await stopImageJobWorker();
    mocks.deleteOSSFile.mockResolvedValue(undefined);
    await startImageJobWorker();
    await waitFor(async () => (await dbGet<{ status: string }>('SELECT status FROM image_jobs WHERE id = ?', [jobId]))?.status === 'completed');
  });

  it('retries processing three times, reports failure, and retains the source', async () => {
    mocks.processUploadedImage.mockRejectedValue(new Error('invalid image'));
    const jobId = await enqueueImageJob('gallery/incoming/broken.jpg', 'image/jpeg', metadata);
    await waitFor(async () => (await dbGet<{ status: string }>('SELECT status FROM image_jobs WHERE id = ?', [jobId]))?.status === 'failed');
    expect((await getImageJobStatuses([jobId]))[0]?.status).toBe('failed');
    expect(mocks.processUploadedImage).toHaveBeenCalledTimes(3);
    expect(mocks.deleteOSSFile).not.toHaveBeenCalledWith('gallery/incoming/broken.jpg');
    expect(await photos.getPhotoById(`photo-${jobId}`)).toBeNull();
  });

  it('cleans retained failed sources only after seven days', async () => {
    await stopImageJobWorker();
    await dbRun(`INSERT INTO image_jobs (id, source_object_key, source_mime, metadata, status, attempts, completed_at)
      VALUES ('expired-failure', 'gallery/incoming/expired.jpg', 'image/jpeg', ?, 'failed', 3, datetime('now', '-8 days'))`, [JSON.stringify(metadata)]);
    await startImageJobWorker();
    await waitFor(async () => (await dbGet<{ status: string }>("SELECT status FROM image_jobs WHERE id = 'expired-failure'"))?.status === 'failed_source_cleaned');
    expect(mocks.deleteOSSFile).toHaveBeenCalledWith('gallery/incoming/expired.jpg');
    expect((await getImageJobStatuses(['expired-failure']))[0]?.status).toBe('failed');
  });

  it('finishes a restarted processing job without creating a duplicate photo', async () => {
    await stopImageJobWorker();
    const jobId = 'restart-job';
    await photos.createPhoto({ url: '/existing.avif', thumbnail_url: '/existing-thumb.avif', title: '已发布', year: 2026, width: 1200, height: 800, tags: [] }, `photo-${jobId}`);
    await dbRun(`INSERT INTO image_jobs (id, source_object_key, source_mime, metadata, status, attempts)
      VALUES (?, ?, 'image/jpeg', ?, 'processing', 1)`, [jobId, 'gallery/incoming/restart.jpg', JSON.stringify(metadata)]);
    await startImageJobWorker();
    await waitFor(async () => (await getImageJobStatuses([jobId]))[0]?.status === 'completed');
    expect(mocks.processUploadedImage).not.toHaveBeenCalled();
    expect(await dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM photos WHERE id = ?', [`photo-${jobId}`])).toEqual({ count: 1 });
  });
});
