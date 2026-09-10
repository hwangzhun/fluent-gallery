import type { Photo } from '../types';
import type { PhotoUploadData } from '../components/photo-modal/types';
import type { PhotoWithTags } from '../database/types';
import { apiFetch } from './config';
import { dbPhotoToPhoto } from './utils';

interface UploadResponse { success: boolean; data: PhotoWithTags; error?: string }
export interface PhotoUploadDependencies { apiFetch: typeof apiFetch }

export function parsePhotoTags(tags: string): string[] {
  return [...new Set(tags.split(',').map(tag => tag.trim()).filter(Boolean))];
}

export class PhotoUploadService {
  constructor(private readonly dependencies: PhotoUploadDependencies = { apiFetch }) {}

  async uploadPhoto(data: PhotoUploadData): Promise<Photo> {
    const body = new FormData();
    body.append('file', data.file);
    body.append('metadata', JSON.stringify({ title: data.title, year: Number(data.year), tags: parsePhotoTags(data.tags), exif: data.exif }));
    const response = await this.dependencies.apiFetch('/photos/upload', { method: 'POST', body });
    const result: UploadResponse = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || '照片上传失败');
    return dbPhotoToPhoto(result.data);
  }
}

export const photoUploadService = new PhotoUploadService();
