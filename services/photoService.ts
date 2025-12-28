import { Photo } from '../types';
import { API_BASE_URL } from './config';
import { dbPhotoToPhoto, photoToCreateInput } from './utils';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

class PhotoService {
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

      const result: ApiResponse<Photo[]> = await response.json();
      
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

      const result: ApiResponse<Photo> = await response.json();
      
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
    metadata: Omit<Photo, 'id' | 'url' | 'thumbnailUrl' | 'createdAt'>
  ): Promise<Photo> {
    try {
      const input = photoToCreateInput({
        ...metadata,
        url,
        thumbnailUrl
      });

      const response = await fetch(`${API_BASE_URL}/photos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<Photo> = await response.json();
      
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
      if (updates.url !== undefined) input.url = updates.url;
      if (updates.thumbnailUrl !== undefined) input.thumbnail_url = updates.thumbnailUrl;
      if (updates.title !== undefined) input.title = updates.title;
      if (updates.description !== undefined) input.description = updates.description;
      if (updates.year !== undefined) input.year = updates.year;
      if (updates.width !== undefined) input.width = updates.width;
      if (updates.height !== undefined) input.height = updates.height;
      if (updates.exif !== undefined) input.exif = updates.exif;
      if (updates.tags !== undefined) input.tags = updates.tags;

      const response = await fetch(`${API_BASE_URL}/photos/${id}`, {
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

      const result: ApiResponse<Photo> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '更新照片失败');
      }

      return dbPhotoToPhoto(result.data);
    } catch (error) {
      console.error('更新照片失败:', error);
      throw error;
    }
  }

  /**
   * 删除照片
   */
  async deletePhoto(id: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/photos/${id}`, {
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