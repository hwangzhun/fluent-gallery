import { v4 as uuidv4 } from 'uuid';
import type { ExifInfo } from '../database/types';
import { dbAll, dbGet, dbRun } from '../database/db';
import { PhotoDao } from '../database/dao/photoDao';
import { processUploadedImage } from './imageProcessing';
import { storeProcessedImages } from './storage/processed';
import { deleteOSSFile, getOSSClient, putTencentProcessedObject } from './storage/oss';
import { loadStorageConfig } from './storage/config';

export interface ImageJobMetadata {
  albumIds?: string[];
  albumBeforePhotoIds?: string[];
  title: string;
  year: number;
  tags: string[];
  exif?: ExifInfo;
}

interface ImageJobRow {
  id: string;
  source_object_key: string;
  source_mime: string;
  metadata: string;
  status: 'queued' | 'cleanup_pending' | 'failed_cleanup';
  attempts: number;
}

export interface ImageJobStatus {
  id: string;
  photoId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  error: string | null;
}

const dao = new PhotoDao();
const MAX_PROCESSING_ATTEMPTS = 3;
const CLEANUP_ATTEMPTS_PER_RUN = 3;
const FAILED_SOURCE_RETENTION_DAYS = 7;
let timer: NodeJS.Timeout | undefined;
let running = false;
let stopping = false;
let workerPromise: Promise<void> | undefined;

const photoIdForJob = (jobId: string) => `photo-${jobId}`;

export async function enqueueImageJob(sourceObjectKey: string, sourceMime: string, metadata: ImageJobMetadata) {
  const id = uuidv4();
  await dbRun(
    `INSERT INTO image_jobs (id, source_object_key, source_mime, metadata, status, updated_at)
     VALUES (?, ?, ?, ?, 'queued', datetime('now'))`,
    [id, sourceObjectKey, sourceMime || 'application/octet-stream', JSON.stringify(metadata)],
  );
  kickImageJobWorker();
  return id;
}

export async function getImageJobStatuses(ids: string[]): Promise<ImageJobStatus[]> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return [];
  const rows = await dbAll<{ id: string; status: string; error: string | null }>(
    `SELECT id, status, error FROM image_jobs WHERE id IN (${uniqueIds.map(() => '?').join(', ')})`,
    uniqueIds,
  );
  return rows.map(row => ({
    id: row.id,
    photoId: photoIdForJob(row.id),
    status: row.status === 'completed' || row.status === 'cleanup_pending' || row.status === 'cleanup_processing'
      ? 'completed'
      : row.status.startsWith('failed')
        ? 'failed'
        : row.status === 'processing'
          ? 'processing'
          : 'queued',
    error: row.error,
  }));
}

async function cleanupExpiredFailedSources() {
  const jobs = await dbAll<Pick<ImageJobRow, 'id' | 'source_object_key'>>(
    `SELECT id, source_object_key FROM image_jobs
     WHERE status = 'failed' AND completed_at <= datetime('now', ?)
     ORDER BY completed_at ASC LIMIT 20`,
    [`-${FAILED_SOURCE_RETENTION_DAYS} days`],
  );
  for (const job of jobs) {
    try {
      await deleteOSSFile(job.source_object_key);
      await dbRun(`UPDATE image_jobs SET status = 'failed_source_cleaned', updated_at = datetime('now') WHERE id = ? AND status = 'failed'`, [job.id]);
    } catch (error) {
      console.error(`过期失败源文件清理失败 (${job.id}):`, error);
    }
  }
}

async function downloadSource(key: string): Promise<Buffer> {
  const config = await loadStorageConfig();
  if (config.mode !== 'oss' || !config.oss) throw new Error('图片处理任务要求对象存储模式');
  const client = await getOSSClient();
  if (config.oss.provider === 'tencent') {
    const data: any = await new Promise((resolve, reject) => (client as any).getObject({ Bucket: config.oss!.bucket, Region: config.oss!.region, Key: key }, (error: Error, result: unknown) => error ? reject(error) : resolve(result)));
    return Buffer.from(data.Body);
  }
  const result: any = await (client as any).get(key);
  return Buffer.from(result.content);
}

async function claimNextImageJob(): Promise<ImageJobRow | undefined> {
  const job = await dbGet<ImageJobRow>(`SELECT id, source_object_key, source_mime, metadata, status, attempts
    FROM image_jobs WHERE status IN ('queued', 'cleanup_pending', 'failed_cleanup')
    ORDER BY CASE status WHEN 'queued' THEN 0 ELSE 1 END, created_at ASC LIMIT 1`);
  if (!job) return undefined;
  const processingStatus = job.status === 'cleanup_pending'
    ? 'cleanup_processing'
    : job.status === 'failed_cleanup' ? 'failed_cleanup_processing' : 'processing';
  const claimed = await dbRun(`UPDATE image_jobs SET status = ?, attempts = attempts + 1,
    started_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status = ?`, [processingStatus, job.id, job.status]);
  return claimed.changes ? job : undefined;
}

async function deleteSourceWithRetries(key: string): Promise<Error | undefined> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < CLEANUP_ATTEMPTS_PER_RUN; attempt += 1) {
    try {
      await deleteOSSFile(key);
      return undefined;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  return lastError;
}

async function finishSourceCleanup(job: ImageJobRow, terminalStatus: 'completed' | 'failed') {
  const cleanupError = await deleteSourceWithRetries(job.source_object_key);
  if (!cleanupError) {
    await dbRun(`UPDATE image_jobs SET status = ?, completed_at = datetime('now'),
      error = CASE WHEN ? = 'completed' THEN NULL ELSE error END, updated_at = datetime('now') WHERE id = ?`,
    [terminalStatus, terminalStatus, job.id]);
    return true;
  }
  const pendingStatus = terminalStatus === 'completed' ? 'cleanup_pending' : 'failed_cleanup';
  const message = `源文件清理失败: ${cleanupError.message}`.slice(0, 1000);
  await dbRun(`UPDATE image_jobs SET status = ?, error = CASE WHEN error IS NULL OR error = '' THEN ? ELSE error || '; ' || ? END,
    updated_at = datetime('now') WHERE id = ?`, [pendingStatus, message, message, job.id]);
  console.error(`后台图片源文件清理失败 (${job.id}):`, cleanupError);
  return false;
}

async function processNextImageJob() {
  if (running) return;
  running = true;
  try {
    await cleanupExpiredFailedSources();
    while (!stopping) {
      const job = await claimNextImageJob();
      if (!job) return;
      if (job.status === 'cleanup_pending' || job.status === 'failed_cleanup') {
        const cleaned = await finishSourceCleanup(job, job.status === 'cleanup_pending' ? 'completed' : 'failed');
        if (!cleaned) return;
        continue;
      }
      let stored: Awaited<ReturnType<typeof storeProcessedImages>> | undefined;
      try {
        const photoId = photoIdForJob(job.id);
        if (await dao.getPhotoById(photoId)) {
          await dbRun(`UPDATE image_jobs SET status = 'cleanup_pending', error = NULL, updated_at = datetime('now') WHERE id = ?`, [job.id]);
          if (!await finishSourceCleanup(job, 'completed')) return;
          continue;
        }
        const config = await loadStorageConfig();
        const useTencentCloudProcessing = config.mode === 'oss'
          && config.oss?.provider === 'tencent'
          && config.oss.cloudImageProcessing;
        const processed = useTencentCloudProcessing
          ? await putTencentProcessedObject(await getOSSClient(), job.source_object_key, config.oss!)
          : await (async () => {
              const source = await downloadSource(job.source_object_key);
              const images = await processUploadedImage({ buffer: source, mimetype: job.source_mime, originalname: job.source_object_key });
              const locations = await storeProcessedImages(images.display, images.thumbnail);
              return { ...locations, width: images.width, height: images.height };
            })();
        stored = processed;
        const metadata = JSON.parse(job.metadata) as ImageJobMetadata;
        await dao.createPhoto({
          ...metadata,
          url: processed.url,
          thumbnail_url: processed.thumbnailUrl,
          object_key: processed.objectKey,
          thumbnail_object_key: processed.thumbnailObjectKey,
          width: processed.width,
          height: processed.height,
        }, photoId);
        // Publishing and source cleanup are separate phases. Once the photo row
        // exists, cleanup failures must never remove its display objects.
        await dbRun(`UPDATE image_jobs SET status = 'cleanup_pending', error = NULL, updated_at = datetime('now') WHERE id = ?`, [job.id]);
        if (!await finishSourceCleanup(job, 'completed')) return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`后台图片处理失败 (${job.id}):`, error);
        // createPhoto may have committed immediately before a connection error.
        // Re-check before deleting output so a published photo can never be broken.
        if (await dao.getPhotoById(photoIdForJob(job.id))) {
          await dbRun(`UPDATE image_jobs SET status = 'cleanup_pending', error = NULL, updated_at = datetime('now') WHERE id = ?`, [job.id]);
          if (!await finishSourceCleanup(job, 'completed')) return;
          continue;
        }
        if (stored) await Promise.allSettled([deleteOSSFile(stored.objectKey), deleteOSSFile(stored.thumbnailObjectKey)]);
        const attempt = job.attempts + 1;
        if (attempt < MAX_PROCESSING_ATTEMPTS) {
          await dbRun(`UPDATE image_jobs SET status = 'queued', error = ?, started_at = NULL,
            updated_at = datetime('now') WHERE id = ?`, [message.slice(0, 1000), job.id]);
          continue;
        }
        // Keep the browser-uploaded source after a terminal processing failure.
        // It is the only recoverable artifact and is needed for diagnosis/retry.
        await dbRun(`UPDATE image_jobs SET status = 'failed', error = ?, completed_at = datetime('now'),
          updated_at = datetime('now') WHERE id = ?`, [message.slice(0, 1000), job.id]);
      }
    }
  } finally {
    running = false;
  }
}

function kickImageJobWorker() {
  if (stopping || workerPromise) return;
  workerPromise = processNextImageJob().finally(() => { workerPromise = undefined; });
}

export async function startImageJobWorker() {
  // 进程中断时，未完成的任务可在下次启动后重新处理。
  stopping = false;
  await dbRun(`UPDATE image_jobs SET status = CASE
    WHEN status = 'processing' THEN 'queued'
    WHEN status = 'cleanup_processing' THEN 'cleanup_pending'
    WHEN status = 'failed_cleanup_processing' THEN 'failed_cleanup'
    ELSE status END, updated_at = datetime('now')
    WHERE status IN ('processing', 'cleanup_processing', 'failed_cleanup_processing')`);
  kickImageJobWorker();
  timer = setInterval(kickImageJobWorker, 5_000);
}

export async function stopImageJobWorker() {
  stopping = true;
  if (timer) clearInterval(timer);
  timer = undefined;
  await workerPromise;
}
