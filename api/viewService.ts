import { API_BASE_URL } from './config';
import { getVisitorFingerprint } from './visitorIdentity';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

interface ViewResponse {
  viewed: boolean;
  viewsCount: number;
}

interface ViewStatusResponse {
  viewed: boolean;
  viewsCount: number;
}

// LocalStorage 键名
const VIEWED_PHOTOS_KEY = 'fluent_gallery_viewed_photos';

/**
 * 浏览量服务
 */
class ViewService {
  /**
   * 获取或生成浏览器指纹（复用点赞服务的指纹）
   */
  async getFingerprint(): Promise<string> {
    return getVisitorFingerprint();
  }

  /**
   * 获取已浏览的照片列表（从 LocalStorage）
   */
  private getViewedPhotos(): Set<string> {
    try {
      const viewed = localStorage.getItem(VIEWED_PHOTOS_KEY);
      if (viewed) {
        const data = JSON.parse(viewed);
        // 清理过期数据（24小时前）
        const now = Date.now();
        const validData: Record<string, number> = {};
        for (const [photoId, timestamp] of Object.entries(data)) {
          if (typeof timestamp === 'number' && now - timestamp < 24 * 60 * 60 * 1000) {
            validData[photoId] = timestamp;
          }
        }
        // 如果数据有变化，更新 LocalStorage
        if (Object.keys(validData).length !== Object.keys(data).length) {
          localStorage.setItem(VIEWED_PHOTOS_KEY, JSON.stringify(validData));
        }
        return new Set(Object.keys(validData));
      }
    } catch (error) {
      console.error('读取已浏览列表失败:', error);
    }
    return new Set();
  }

  /**
   * 标记照片为已浏览（保存到 LocalStorage）
   */
  private markAsViewed(photoId: string): void {
    try {
      const viewed = this.getViewedPhotos();
      viewed.add(photoId);
      const data: Record<string, number> = {};
      viewed.forEach(id => {
        data[id] = Date.now();
      });
      localStorage.setItem(VIEWED_PHOTOS_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('保存浏览状态失败:', error);
    }
  }

  /**
   * 检查照片是否已浏览（基于 LocalStorage）
   */
  isViewed(photoId: string): boolean {
    return this.getViewedPhotos().has(photoId);
  }

  /**
   * 记录照片浏览量
   */
  async recordView(photoId: string): Promise<ViewResponse> {
    try {
      // 检查是否已浏览（前端快速检查）
      if (this.isViewed(photoId)) {
        // 即使前端显示已浏览，也获取最新的浏览量
        const status = await this.getViewStatus(photoId);
        return {
          viewed: true,
          viewsCount: status.viewsCount
        };
      }

      // 获取指纹
      const fingerprint = await this.getFingerprint();

      // 创建超时控制器
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

      // 发送浏览量记录请求
      const response = await fetch(`${API_BASE_URL}/photos/${photoId}/view`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fingerprint }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<ViewResponse> = await response.json();

      if (!result.success) {
        throw new Error(result.error || '记录浏览量失败');
      }

      // 标记为已浏览
      this.markAsViewed(photoId);

      return result.data;
    } catch (error: any) {
      console.error('记录浏览量失败:', error);
      
      // 如果是超时或网络错误，静默失败（不影响用户体验）
      // 浏览量统计不是关键功能，失败时不影响正常使用
      
      // 返回本地缓存的浏览量或0
      const count = await this.getViewCount(photoId).catch(() => 0);
      return {
        viewed: this.isViewed(photoId),
        viewsCount: count
      };
    }
  }

  /**
   * 获取照片的浏览量状态
   */
  async getViewStatus(photoId: string): Promise<ViewStatusResponse> {
    try {
      const fingerprint = await this.getFingerprint();

      // 创建超时控制器
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

      const response = await fetch(
        `${API_BASE_URL}/photos/${photoId}/view-status?fingerprint=${encodeURIComponent(fingerprint)}`,
        {
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<ViewStatusResponse> = await response.json();

      if (!result.success) {
        throw new Error(result.error || '获取浏览量状态失败');
      }

      // 同步 LocalStorage
      if (result.data.viewed) {
        this.markAsViewed(photoId);
      }

      return result.data;
    } catch (error: any) {
      console.error('获取浏览量状态失败:', error);
      
      // 如果获取失败，返回本地缓存的状态
      const localViewed = this.isViewed(photoId);
      const count = await this.getViewCount(photoId).catch(() => 0);
      
      return {
        viewed: localViewed,
        viewsCount: count
      };
    }
  }

  /**
   * 获取照片的浏览量（简单接口）
   */
  async getViewCount(photoId: string): Promise<number> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒超时

      const response = await fetch(`${API_BASE_URL}/photos/${photoId}/views`, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<{ viewsCount: number }> = await response.json();

      if (!result.success) {
        throw new Error(result.error || '获取浏览量失败');
      }

      return result.data.viewsCount;
    } catch (error) {
      console.error('获取浏览量失败:', error);
      throw error;
    }
  }
}

export const viewService = new ViewService();
