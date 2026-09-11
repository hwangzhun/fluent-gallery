import { Photo } from '../types';
import { PhotoWithTags } from '../database/types';
import { API_BASE_URL, apiFetch } from './config';
import { dbPhotoToPhoto, photoToCreateInput } from './utils';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

export interface AdminPhotoPage {
  items: Photo[];
  total: number;
  page: number;
  pageSize: 30 | 60 | 120;
  totalPages: number;
}

export type AdminPhotoSort = 'latest' | 'likes' | 'views';
export interface BulkPhotoChanges { year?: number; exif?: Record<string, string>; tags?: { mode: 'append' | 'remove' | 'replace'; values: string[] }; }
export interface PublicPhotoPage { items: Photo[]; total: number; hasMore: boolean; nextCursor: string | null }

class PhotoService {
  async getPublicPhotoPage(options: { limit?: number; cursor?: string; year?: number; tag?: string; tags?: string[]; search?: string; signal?: AbortSignal } = {}): Promise<PublicPhotoPage> {
    const params = new URLSearchParams({ limit: String(options.limit || 50) });
    if (options.cursor) params.set('cursor', options.cursor);
    if (options.year) params.set('year', String(options.year));
    if (options.tags?.length) params.set('tags', options.tags.join(','));
    else if (options.tag) params.set('tag', options.tag);
    if (options.search) params.set('search', options.search);
    const response = await fetch(`${API_BASE_URL}/photos/page?${params}`, { signal: options.signal });
    const result: ApiResponse<{ items: PhotoWithTags[]; total: number; hasMore: boolean; nextCursor: string | null }> = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || '获取照片失败');
    return { ...result.data, items: result.data.items.map(dbPhotoToPhoto) };
  }

  async getAdminPhotos(options: { page: number; pageSize: 30 | 60 | 120; albumId?: string; year?: number; tags?: string[]; search?: string; sort?: AdminPhotoSort; signal?: AbortSignal }): Promise<AdminPhotoPage> {
    const params = new URLSearchParams({ page: String(options.page), pageSize: String(options.pageSize), sort: options.sort || 'latest' });
    if (options.albumId) params.set('albumId', options.albumId);
    if (options.year) params.set('year', String(options.year));
    if (options.tags?.length) params.set('tags', options.tags.join(','));
    if (options.search) params.set('search', options.search);
    const response = await apiFetch(`/photos/admin?${params}`, { signal: options.signal });
    const result: ApiResponse<{ items: PhotoWithTags[]; total: number; page: number; pageSize: 30 | 60 | 120; totalPages: number }> = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || '获取后台照片失败');
    return { ...result.data, items: result.data.items.map(dbPhotoToPhoto) };
  }

  /**
   * 获取所有照片（支持筛选和搜索）
   */
  async getPhotos(options?: { 
    year?: number; 
    tag?: string; // 向后兼容单标签
    tags?: string[]; // 多标签筛选
    search?: string 
  }): Promise<Photo[]> {
    try {
      const params = new URLSearchParams();
      if (options?.year) {
        params.append('year', options.year.toString());
      }
      // 优先使用tags数组（多标签）
      if (options?.tags && options.tags.length > 0) {
        params.append('tags', options.tags.join(','));
      } else if (options?.tag) {
        // 向后兼容单标签
        params.append('tag', options.tag);
      }
      if (options?.search) {
        params.append('search', options.search);
      }

      const url = `${API_BASE_URL}/photos${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<PhotoWithTags[]> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '获取照片失败');
      }

      // 转换数据库格式到前端格式
      return result.data.map(dbPhotoToPhoto);
    } catch (error) {
      console.error('获取照片列表失败:', error);
      throw error;
    }
  }

  /**
   * 根据 ID 获取照片详情
   */
  async getPhotoById(id: string): Promise<Photo> {
    try {
      const response = await fetch(`${API_BASE_URL}/photos/${id}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('照片不存在');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<PhotoWithTags> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '获取照片失败');
      }

      return dbPhotoToPhoto(result.data);
    } catch (error) {
      console.error('获取照片详情失败:', error);
      throw error;
    }
  }

  /**
   * 上传照片（创建新照片）
   * 注意：这里假设图片已经上传到 OSS，传入的是 OSS URL
   * 如果需要在后端上传，需要先调用 OSS 上传接口，再调用此接口
   */
  async uploadPhoto(
    url: string,
    thumbnailUrl: string,
    metadata: Omit<Photo, 'id' | 'url' | 'thumbnailUrl' | 'createdAt' | 'likesCount' | 'viewsCount' | 'isLiked'>
  ): Promise<Photo> {
    try {
      const input = photoToCreateInput({
        ...metadata,
        url,
        thumbnailUrl
      });

      const response = await apiFetch('/photos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<PhotoWithTags> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '上传照片失败');
      }

      return dbPhotoToPhoto(result.data);
    } catch (error) {
      console.error('上传照片失败:', error);
      throw error;
    }
  }

  /**
   * 更新照片
   */
  async updatePhoto(id: string, updates: Partial<Photo>): Promise<Photo> {
    try {
      // 转换前端格式到数据库格式
      const input: any = {};
      if (updates.albumIds !== undefined) input.albumIds = updates.albumIds;
      if (updates.url !== undefined) input.url = updates.url;
      if (updates.thumbnailUrl !== undefined) input.thumbnail_url = updates.thumbnailUrl;
      if (updates.title !== undefined) input.title = updates.title;
      if (updates.description !== undefined) input.description = updates.description;
      if (updates.year !== undefined) input.year = updates.year;
      if (updates.width !== undefined) input.width = updates.width;
      if (updates.height !== undefined) input.height = updates.height;
      if (updates.exif !== undefined) input.exif = updates.exif;
      if (updates.tags !== undefined) input.tags = updates.tags;

      const response = await apiFetch(`/photos/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('照片不存在');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<PhotoWithTags> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '更新照片失败');
      }

      return dbPhotoToPhoto(result.data);
    } catch (error) {
      console.error('更新照片失败:', error);
      throw error;
    }
  }

  async batchUpdate(ids: string[], changes: BulkPhotoChanges): Promise<number> {
    const response = await apiFetch('/photos/batch', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, changes }) });
    const result: ApiResponse<{ updated: number }> = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || '批量更新照片失败');
    return result.data.updated;
  }

  async batchDelete(ids: string[]): Promise<{ deleted: number; cleanupFailed: number }> {
    const response = await apiFetch('/photos/batch', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
    const result: ApiResponse<{ deleted: number; cleanupFailed: number }> = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || '批量删除照片失败');
    return result.data;
  }

  /**
   * 删除照片
   */
  async deletePhoto(id: string): Promise<void> {
    try {
      const response = await apiFetch(`/photos/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('照片不存在');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<void> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '删除照片失败');
      }
    } catch (error) {
      console.error('删除照片失败:', error);
      throw error;
    }
  }
}

export const photoService = new PhotoService();
