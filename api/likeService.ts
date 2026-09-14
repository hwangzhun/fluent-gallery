import FingerprintJS from '@fingerprintjs/fingerprintjs';
import { API_BASE_URL } from './config';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
  code?: string;
}

interface LikeResponse {
  liked: boolean;
  likesCount: number;
  created: boolean;
}

type ServerLikeResponse = Omit<LikeResponse, 'created'>;

interface LikeStatusResponse {
  liked: boolean;
  likesCount: number;
  canLike: boolean;
}

// LocalStorage 键名
const LIKED_PHOTOS_KEY = 'fluent_gallery_liked_photos';
const FINGERPRINT_KEY = 'fluent_gallery_fingerprint';

/**
 * 点赞服务
 */
class LikeService {
  private fingerprint: string | null = null;
  private fpPromise: Promise<string> | null = null;

  /**
   * 获取或生成浏览器指纹
   */
  async getFingerprint(): Promise<string> {
    if (this.fingerprint) {
      return this.fingerprint;
    }

    // 检查 LocalStorage 中是否已保存
    const savedFingerprint = localStorage.getItem(FINGERPRINT_KEY);
    if (savedFingerprint) {
      this.fingerprint = savedFingerprint;
      return savedFingerprint;
    }

    // 如果正在生成，等待完成
    if (this.fpPromise) {
      return this.fpPromise;
    }

    // 生成新的指纹
    this.fpPromise = (async () => {
      try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        const fingerprint = result.visitorId;
        
        // 保存到 LocalStorage
        localStorage.setItem(FINGERPRINT_KEY, fingerprint);
        this.fingerprint = fingerprint;
        
        return fingerprint;
      } catch (error) {
        console.error('生成浏览器指纹失败:', error);
        // 如果生成失败，使用时间戳作为后备方案
        const fallbackFingerprint = `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem(FINGERPRINT_KEY, fallbackFingerprint);
        this.fingerprint = fallbackFingerprint;
        return fallbackFingerprint;
      } finally {
        this.fpPromise = null;
      }
    })();

    return this.fpPromise;
  }

  /**
   * 获取已点赞的照片列表（从 LocalStorage）
   */
  private getLikedPhotos(): Set<string> {
    try {
      const liked = localStorage.getItem(LIKED_PHOTOS_KEY);
      if (liked) {
        const data = JSON.parse(liked);
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
          localStorage.setItem(LIKED_PHOTOS_KEY, JSON.stringify(validData));
        }
        return new Set(Object.keys(validData));
      }
    } catch (error) {
      console.error('读取已点赞列表失败:', error);
    }
    return new Set();
  }

  /**
   * 标记照片为已点赞（保存到 LocalStorage）
   */
  private markAsLiked(photoId: string): void {
    try {
      const liked = this.getLikedPhotos();
      liked.add(photoId);
      const data: Record<string, number> = {};
      liked.forEach(id => {
        data[id] = Date.now();
      });
      localStorage.setItem(LIKED_PHOTOS_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('保存点赞状态失败:', error);
    }
  }

  /**
   * 检查照片是否已点赞（基于 LocalStorage）
   */
  isLiked(photoId: string): boolean {
    return this.getLikedPhotos().has(photoId);
  }

  /**
   * 点赞照片
   */
  async likePhoto(photoId: string, retries: number = 1): Promise<LikeResponse> {
    try {
      // 检查是否已点赞（前端快速检查）
      if (this.isLiked(photoId)) {
        // 即使前端显示已点赞，也获取最新的点赞数
        try {
          const status = await this.getLikeStatus(photoId);
          return {
            liked: true,
            likesCount: status.likesCount,
            created: false
          };
        } catch (error) {
          // 如果获取状态失败，返回本地缓存的点赞数
          const count = await this.getLikeCount(photoId).catch(() => 0);
          return {
            liked: true,
            likesCount: count,
            created: false
          };
        }
      }

      // 获取指纹
      const fingerprint = await this.getFingerprint();

      // 创建超时控制器
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

      // 发送点赞请求
      const response = await fetch(`${API_BASE_URL}/photos/${photoId}/like`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fingerprint }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // 如果是网络错误，尝试重试
        if (response.status >= 500 && retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒后重试
          return this.likePhoto(photoId, retries - 1);
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<ServerLikeResponse> = await response.json();

      if (!result.success) {
        // 如果已经点过赞，也标记为已点赞
        if (result.code === 'ALREADY_LIKED' && result.data) {
          this.markAsLiked(photoId);
          return { ...result.data, created: false };
        }
        throw new Error(result.error || '点赞失败');
      }

      // 标记为已点赞
      this.markAsLiked(photoId);

      return { ...result.data, created: true };
    } catch (error: any) {
      console.error('点赞失败:', error);
      
      // 如果是超时错误，提供更友好的错误信息
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error('请求超时，请检查网络连接');
      }
      
      // 如果是网络错误
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        throw new Error('网络连接失败，请检查网络设置');
      }
      
      throw error;
    }
  }

  /**
   * 获取照片的点赞状态
   */
  async getLikeStatus(photoId: string): Promise<LikeStatusResponse> {
    try {
      const fingerprint = await this.getFingerprint();

      // 创建超时控制器
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

      const response = await fetch(
        `${API_BASE_URL}/photos/${photoId}/like-status?fingerprint=${encodeURIComponent(fingerprint)}`,
        {
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<LikeStatusResponse> = await response.json();

      if (!result.success) {
        throw new Error(result.error || '获取点赞状态失败');
      }

      // 同步 LocalStorage
      if (result.data.liked) {
        this.markAsLiked(photoId);
      }

      return result.data;
    } catch (error: any) {
      console.error('获取点赞状态失败:', error);
      
      // 如果获取失败，返回本地缓存的状态
      const localLiked = this.isLiked(photoId);
      const count = await this.getLikeCount(photoId).catch(() => 0);
      
      return {
        liked: localLiked,
        likesCount: count,
        canLike: !localLiked
      };
    }
  }

  /**
   * 获取照片的点赞数（简单接口）
   */
  async getLikeCount(photoId: string): Promise<number> {
    try {
      const response = await fetch(`${API_BASE_URL}/photos/${photoId}/likes`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<{ likesCount: number }> = await response.json();

      if (!result.success) {
        throw new Error(result.error || '获取点赞数失败');
      }

      return result.data.likesCount;
    } catch (error) {
      console.error('获取点赞数失败:', error);
      throw error;
    }
  }
}

export const likeService = new LikeService();
