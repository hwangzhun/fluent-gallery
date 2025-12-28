/**
 * 日志服务（前端）
 */
import { API_BASE_URL } from './config';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  raw: string;
}

export interface LogsResponse {
  logs: LogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  file?: string;
}

export interface LogFile {
  name: string;
  size: number;
  mtime: string;
  path: string;
}

class LogService {
  /**
   * 获取日志
   */
  async getLogs(options?: {
    page?: number;
    limit?: number;
    level?: string;
    search?: string;
    file?: string;
    startTime?: string;
    endTime?: string;
  }): Promise<LogsResponse> {
    try {
      const params = new URLSearchParams();
      if (options?.page) params.append('page', options.page.toString());
      if (options?.limit) params.append('limit', options.limit.toString());
      if (options?.level) params.append('level', options.level);
      if (options?.search) params.append('search', options.search);
      if (options?.file) params.append('file', options.file);
      if (options?.startTime) params.append('startTime', options.startTime);
      if (options?.endTime) params.append('endTime', options.endTime);

      const url = `${API_BASE_URL}/logs${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<LogsResponse> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '获取日志失败');
      }

      return result.data;
    } catch (error) {
      console.error('获取日志失败:', error);
      throw error;
    }
  }

  /**
   * 获取日志文件列表
   */
  async getLogFiles(): Promise<LogFile[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/logs/files`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<LogFile[]> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '获取日志文件列表失败');
      }

      return result.data;
    } catch (error) {
      console.error('获取日志文件列表失败:', error);
      throw error;
    }
  }

  /**
   * 导出日志
   */
  async exportLogs(options?: {
    level?: string;
    search?: string;
    file?: string;
    startTime?: string;
    endTime?: string;
  }): Promise<Blob> {
    try {
      const params = new URLSearchParams();
      if (options?.level) params.append('level', options.level);
      if (options?.search) params.append('search', options.search);
      if (options?.file) params.append('file', options.file);
      if (options?.startTime) params.append('startTime', options.startTime);
      if (options?.endTime) params.append('endTime', options.endTime);

      const url = `${API_BASE_URL}/logs/export${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.blob();
    } catch (error) {
      console.error('导出日志失败:', error);
      throw error;
    }
  }

  /**
   * 清空日志
   */
  async clearLogs(file?: string): Promise<void> {
    try {
      const params = new URLSearchParams();
      if (file) params.append('file', file);

      const url = `${API_BASE_URL}/logs/clear${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<any> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '清空日志失败');
      }
    } catch (error) {
      console.error('清空日志失败:', error);
      throw error;
    }
  }
}

export const logService = new LogService();

