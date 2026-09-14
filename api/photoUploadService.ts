import type { Photo } from '../types';
import type { PhotoUploadData, PhotoUploadResult, QueuedPhotoUpload } from '../components/photo-modal/types';
import type { PhotoWithTags } from '../database/types';
import { apiFetch } from './config';
import { dbPhotoToPhoto } from './utils';

interface UploadResponse { success: boolean; data: PhotoWithTags; error?: string }
interface DirectUploadInitResponse {
  success: boolean;
  data: { direct: boolean; uploadUrl?: string; sourceObjectKey?: string; mime?: string };
  error?: string;
}
export interface ImageJobStatus {
  id: string;
  photoId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  error: string | null;
}
export interface PhotoUploadDependencies { apiFetch: typeof apiFetch }

const PENDING_UPLOAD_JOBS_KEY = 'fluent-gallery-pending-upload-jobs';

function readPendingJobIds(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_UPLOAD_JOBS_KEY) || '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))] : [];
  } catch {
    return [];
  }
}

export function getPendingUploadJobIds(): string[] {
  return readPendingJobIds();
}

export function rememberPendingUploadJob(jobId: string) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PENDING_UPLOAD_JOBS_KEY, JSON.stringify([...new Set([...readPendingJobIds(), jobId])]));
  } catch {
    // A disabled/full browser store must not turn an accepted upload into a failure.
  }
}

export function forgetPendingUploadJobs(jobIds: string[]) {
  if (typeof localStorage === 'undefined') return;
  const removed = new Set(jobIds);
  try {
    localStorage.setItem(PENDING_UPLOAD_JOBS_KEY, JSON.stringify(readPendingJobIds().filter(id => !removed.has(id))));
  } catch {
    // Best-effort cleanup; stale IDs are harmless and can be retried later.
  }
}

export function parsePhotoTags(tags: string): string[] {
  return [...new Set(tags.split(',').map(tag => tag.trim()).filter(Boolean))];
}

export class PhotoUploadService {
  constructor(private readonly dependencies: PhotoUploadDependencies = { apiFetch }) {}

  async uploadPhoto(data: PhotoUploadData): Promise<PhotoUploadResult> {
    const metadata = { albumIds: data.albumIds, albumBeforePhotoIds: data.albumBeforePhotoIds, title: data.title, year: Number(data.year), tags: parsePhotoTags(data.tags), exif: data.exif };
    const init = await this.dependencies.apiFetch('/photos/upload-init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: data.file.name, mime: data.file.type, size: data.file.size, metadata }),
    });
    const initResult: DirectUploadInitResponse = await init.json();
    if (!init.ok || !initResult.success) throw new Error(initResult.error || '初始化图片上传失败');
    if (initResult.data.direct) {
      const { uploadUrl, sourceObjectKey, mime } = initResult.data;
      if (!uploadUrl || !sourceObjectKey) throw new Error('直传地址不完整');
      const uploaded = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': mime || data.file.type || 'application/octet-stream' }, body: data.file });
      if (!uploaded.ok) throw new Error(`上传到 OSS 失败（HTTP ${uploaded.status}）`);
      const completed = await this.dependencies.apiFetch('/photos/upload-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceObjectKey, mime: mime || data.file.type, metadata }),
      });
      const completeResult = await completed.json();
      if (!completed.ok || !completeResult.success) throw new Error(completeResult.error || '创建图片处理任务失败');
      const queued = completeResult.data as { jobId?: unknown } | undefined;
      if (!queued || typeof queued.jobId !== 'string') throw new Error('图片处理任务响应不完整');
      const pending = { kind: 'queued', jobId: queued.jobId, photoId: `photo-${queued.jobId}` } satisfies QueuedPhotoUpload;
      rememberPendingUploadJob(pending.jobId);
      const status = await this.waitForJob(pending.jobId);
      if (!status) return pending;
      forgetPendingUploadJobs([pending.jobId]);
      if (status.status === 'failed') throw new Error(status.error || '图片后台处理失败，源文件已保留');
      const photoResponse = await this.dependencies.apiFetch(`/photos/${status.photoId}`);
      const photoResult: UploadResponse = await photoResponse.json();
      if (!photoResponse.ok || !photoResult.success || !photoResult.data) throw new Error(photoResult.error || '图片处理完成，但无法读取照片记录');
      return dbPhotoToPhoto(photoResult.data);
    }
    const body = new FormData();
    body.append('file', data.file);
    body.append('metadata', JSON.stringify(metadata));
    const response = await this.dependencies.apiFetch('/photos/upload', { method: 'POST', body });
    const result: UploadResponse = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || '照片上传失败');
    return dbPhotoToPhoto(result.data);
  }

  async getJobStatuses(ids: string[], signal?: AbortSignal): Promise<ImageJobStatus[]> {
    const response = await this.dependencies.apiFetch('/photos/upload-jobs/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
      signal,
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || '查询图片处理状态失败');
    return result.data as ImageJobStatus[];
  }

  private async waitForJob(jobId: string): Promise<ImageJobStatus | undefined> {
    let requestFailures = 0;
    for (let poll = 0; poll < 240; poll += 1) {
      try {
        const status = (await this.getJobStatuses([jobId]))[0];
        if (status?.status === 'completed' || status?.status === 'failed') return status;
        requestFailures = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/登录|会话|认证/.test(message)) throw error;
        requestFailures += 1;
        if (requestFailures >= 3) return undefined;
      }
      await new Promise(resolve => setTimeout(resolve, 1_500));
    }
    return undefined;
  }
}

export const photoUploadService = new PhotoUploadService();
