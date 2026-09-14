/**
 * 设置服务（前端）
 */
import type { HeroAspectRatio, HeroImageSettings } from '../shared/hero';
import { API_BASE_URL, apiFetch } from './config';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

export interface AdminSettings {
  hasPassword: boolean;
}

export interface StorageSettings {
  mode: 'local' | 'oss';
  local?: {
    uploadDir: string;
    publicUrl: string;
  };
  oss?: {
    provider?: 'aliyun' | 'tencent'; // OSS 提供商
    uploadDir: string;
    cloudImageProcessing: boolean;
    publicUrl: string;
    region: string;
    accessKeyId?: string;
    accessKeySecret?: string;
    hasAccessKeyId?: boolean;
    hasAccessKeySecret?: boolean;
    bucket: string;
    endpoint?: string;
    roleArn?: string;
    roleSessionName?: string;
  };
}

export interface GallerySettings {
  randomizePhotos: boolean;
  heroPhotoId: string | null;
  heroImageFit: 'contain' | 'cover';
  heroAspectRatio: HeroAspectRatio;
  heroImages?: HeroImageSettings[];
  heroImagePositionX: number;
  heroImagePositionY: number;
  heroImageScale: number;
  heroImagePositionPhotoId: string | null;
}

export interface AuthorSettings { author: string; copyright: string; }

export interface SeoSettings {
  title: string; description: string; keywords: string; author: string;
  canonicalUrl: string; ogTitle: string; ogDescription: string; ogImage: string;
}

export interface AiSettings { baseUrl: string; model: string; apiKey?: string; hasApiKey: boolean; }
export interface AnalyticsSettings { enabled: boolean; measurementId: string; }

class SettingsService {
  /**
   * 获取管理员设置
   */
  async getAdminSettings(): Promise<AdminSettings> {
    try {
      const response = await apiFetch('/settings/admin');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<AdminSettings> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '获取管理员设置失败');
      }

      return result.data;
    } catch (error) {
      console.error('获取管理员设置失败:', error);
      throw error;
    }
  }

  /**
   * 更新管理员密码
   */
  async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      const response = await apiFetch('/settings/admin/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '更新密码失败');
      }

      const result: ApiResponse<void> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '更新密码失败');
      }
    } catch (error) {
      console.error('更新密码失败:', error);
      throw error;
    }
  }

  /**
   * 获取存储设置
   */
  async getStorageSettings(): Promise<StorageSettings> {
    try {
      const response = await apiFetch('/settings/storage');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<StorageSettings> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '获取存储设置失败');
      }

      return result.data;
    } catch (error) {
      console.error('获取存储设置失败:', error);
      throw error;
    }
  }

  /**
   * 更新存储设置
   */
  async updateStorageSettings(settings: StorageSettings): Promise<void> {
    try {
      const response = await apiFetch('/settings/storage', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '更新存储设置失败');
      }

      const result: ApiResponse<void> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '更新存储设置失败');
      }
    } catch (error) {
      console.error('更新存储设置失败:', error);
      throw error;
    }
  }

  /**
   * 获取图库设置
   */
  async getGallerySettings(): Promise<GallerySettings> {
    try {
      const response = await apiFetch('/settings/gallery');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<GallerySettings> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '获取图库设置失败');
      }

      return result.data;
    } catch (error) {
      console.error('获取图库设置失败:', error);
      throw error;
    }
  }

  /**
   * 更新图库设置
   */
  async updateGallerySettings(settings: GallerySettings): Promise<void> {
    try {
      const response = await apiFetch('/settings/gallery', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '更新图库设置失败');
      }

      const result: ApiResponse<void> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '更新图库设置失败');
      }
    } catch (error) {
      console.error('更新图库设置失败:', error);
      throw error;
    }
  }

  async getAuthorSettings(): Promise<AuthorSettings> {
    const response = await apiFetch('/settings/author');
    const result: ApiResponse<AuthorSettings> = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || '获取作者信息失败');
    return result.data;
  }

  async updateAuthorSettings(settings: AuthorSettings): Promise<void> {
    const response = await apiFetch('/settings/author', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    const result: ApiResponse<AuthorSettings> = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || '保存作者信息失败');
  }

  async getSeoSettings(): Promise<SeoSettings> {
    const response = await fetch(`${API_BASE_URL}/settings/seo`);
    const result: ApiResponse<SeoSettings> = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || '获取 SEO 设置失败');
    return result.data;
  }

  async updateSeoSettings(settings: SeoSettings): Promise<void> {
    const response = await apiFetch('/settings/seo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    const result: ApiResponse<SeoSettings> = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || '保存 SEO 设置失败');
  }

  async getAnalyticsSettings(): Promise<AnalyticsSettings> {
    const response = await fetch(`${API_BASE_URL}/settings/analytics`);
    const result: ApiResponse<AnalyticsSettings> = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || '获取数据统计设置失败');
    return result.data;
  }

  async updateAnalyticsSettings(settings: AnalyticsSettings): Promise<void> {
    const response = await apiFetch('/settings/analytics', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    const result: ApiResponse<AnalyticsSettings> = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || '保存数据统计设置失败');
  }

  async getAiSettings(): Promise<AiSettings> {
    const response = await apiFetch('/settings/ai');
    const result: ApiResponse<AiSettings> = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || '获取 API 设置失败');
    return result.data;
  }

  async updateAiSettings(settings: Pick<AiSettings, 'baseUrl' | 'model' | 'apiKey'>): Promise<void> {
    const response = await apiFetch('/settings/ai', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    const result: ApiResponse<AiSettings> = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || '保存 API 设置失败');
  }
}

export const settingsService = new SettingsService();
