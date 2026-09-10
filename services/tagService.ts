import { API_BASE_URL, apiFetch } from './config';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

export interface Tag {
  id: number;
  name: string;
  created_at: string;
}

export interface TagWithCount extends Tag {
  photoCount: number;
}

async function parseAdminResponse<T>(response: Response, fallback: string): Promise<T> {
  const result: ApiResponse<T> = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || fallback);
  return result.data;
}

class TagService {
  async getAdminTags(): Promise<TagWithCount[]> {
    const response = await apiFetch('/tags/admin');
    return parseAdminResponse<TagWithCount[]>(response, '获取标签列表失败');
  }

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
      const response = await apiFetch('/tags', {
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

  async renameTag(id: number, name: string): Promise<Tag> {
    const response = await apiFetch(`/tags/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    return parseAdminResponse<Tag>(response, '标签重命名失败');
  }

  async deleteTag(id: number): Promise<void> {
    const response = await apiFetch(`/tags/${id}`, { method: 'DELETE' });
    await parseAdminResponse<unknown>(response, '删除标签失败');
  }

  /**
   * 获取所有可用的年份（从照片中提取）
   */
  async getAvailableYears(): Promise<number[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/tags/years`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<number[]> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '获取年份失败');
      }
      return result.data;
    } catch (error) {
      console.error('获取年份列表失败:', error);
      throw error;
    }
  }
}

export const tagService = new TagService();
