import { API_BASE_URL } from './config';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

interface Tag {
  id: number;
  name: string;
  created_at: string;
}

class TagService {
  /**
   * 获取所有标签
   */
  async getAllTags(): Promise<Tag[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/tags`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<Tag[]> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '获取标签失败');
      }

      return result.data;
    } catch (error) {
      console.error('获取标签列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取所有标签名称（用于筛选）
   */
  async getAllTagNames(): Promise<string[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/tags/names`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<string[]> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '获取标签名称失败');
      }

      return result.data;
    } catch (error) {
      console.error('获取标签名称列表失败:', error);
      throw error;
    }
  }

  /**
   * 创建新标签
   */
  async createTag(name: string): Promise<Tag> {
    try {
      const response = await fetch(`${API_BASE_URL}/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<Tag> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '创建标签失败');
      }

      return result.data;
    } catch (error) {
      console.error('创建标签失败:', error);
      throw error;
    }
  }

  /**
   * 获取所有可用的年份（从照片中提取）
   */
  async getAvailableYears(): Promise<number[]> {
    try {
      // 获取所有照片，然后提取年份
      const response = await fetch(`${API_BASE_URL}/photos`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<any[]> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '获取照片失败');
      }

      // 从照片中提取所有唯一的年份
      const years = Array.from(new Set(result.data.map((photo: any) => photo.year)))
        .filter((year): year is number => typeof year === 'number')
        .sort((a, b) => b - a); // 降序排列

      return years;
    } catch (error) {
      console.error('获取年份列表失败:', error);
      throw error;
    }
  }
}

export const tagService = new TagService();

