/**
 * OSS 服务（前端）
 */
import { API_BASE_URL, apiFetch } from './config';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

export interface STSCredentials {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  expiration: string;
  region: string;
  bucket: string;
  endpoint?: string;
  provider?: 'aliyun' | 'tencent'; // OSS 提供商
}

interface OSSConfig {
  mode: 'local' | 'oss';
  region?: string;
  bucket?: string;
  endpoint?: string;
  publicUrl?: string;
}

class OSSService {
  /**
   * 获取 STS 临时凭证
   */
  async getSTSCredentials(): Promise<STSCredentials> {
    try {
      const response = await apiFetch('/oss/sts');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<STSCredentials> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '获取 STS 凭证失败');
      }

      return result.data;
    } catch (error) {
      console.error('获取 STS 凭证失败:', error);
      throw error;
    }
  }

  /**
   * 获取 OSS 配置信息
   */
  async getOSSConfig(): Promise<OSSConfig> {
    try {
      const response = await apiFetch('/oss/config');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse<OSSConfig> = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '获取 OSS 配置失败');
      }

      return result.data;
    } catch (error) {
      console.error('获取 OSS 配置失败:', error);
      throw error;
    }
  }

  /**
   * 检查当前存储模式
   */
  async checkStorageMode(): Promise<'local' | 'oss'> {
    try {
      const config = await this.getOSSConfig();
      return config.mode;
    } catch {
      // 如果获取失败，默认返回 local
      return 'local';
    }
  }
}

export const ossService = new OSSService();

/**
 * 生成文件路径
 */
export function generateFilePath(filename: string, prefix: string = 'photos'): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  // 提取文件扩展名
  const ext = filename.split('.').pop() || 'jpg';
  
  // 生成唯一文件名
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  const uniqueFilename = `${timestamp}-${random}.${ext}`;
  
  return `${prefix}/${year}/${month}/${day}/${uniqueFilename}`;
}

/**
 * 上传文件到 OSS（前端直传，仅支持阿里云）
 */
export async function uploadToOSS(
  file: File,
  path: string,
  credentials: STSCredentials
): Promise<string> {
  // 如果是腾讯云，直接使用后端代理上传
  if (credentials.provider === 'tencent') {
    console.log('📤 腾讯云 COS 使用后端代理上传');
    return await uploadToOSSViaProxy(file);
  }

  // 阿里云 OSS：尝试前端直传
  // 动态导入 ali-oss（避免 SSR 问题）
  const OSS = (await import('ali-oss')).default;
  
  const client = new OSS({
    region: credentials.region,
    accessKeyId: credentials.accessKeyId,
    accessKeySecret: credentials.accessKeySecret,
    stsToken: credentials.securityToken || undefined,
    bucket: credentials.bucket,
    endpoint: credentials.endpoint
  });

  try {
    const result = await client.put(path, file);
    return result.url;
  } catch (error: any) {
    console.error('上传到 OSS 失败:', error);
    throw new Error(`上传到 OSS 失败: ${error.message}`);
  }
}

/**
 * 通过后端代理上传到 OSS（用于解决 CORS 问题）
 */
export async function uploadToOSSViaProxy(file: File): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiFetch('/oss/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result: ApiResponse<{ url: string; path: string; size: number }> = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || '上传到 OSS 失败');
    }

    return result.data.url;
  } catch (error: any) {
    console.error('通过代理上传到 OSS 失败:', error);
    throw new Error(`通过代理上传到 OSS 失败: ${error.message}`);
  }
}

/**
 * 上传文件到 OSS（自动选择方式：优先直传，失败时使用代理）
 */
export async function uploadToOSSAuto(
  file: File,
  path: string,
  credentials: STSCredentials
): Promise<string> {
  try {
    // 先尝试前端直传
    return await uploadToOSS(file, path, credentials);
  } catch (error: any) {
    // 如果是 CORS 错误，使用后端代理上传
    if (error.message.includes('CORS') || error.message.includes('Access-Control-Allow-Origin') || error.message.includes('XHR error')) {
      console.warn('⚠️  前端直传失败（可能是 CORS 问题），切换到后端代理上传');
      return await uploadToOSSViaProxy(file);
    }
    // 其他错误直接抛出
    throw error;
  }
}

/**
 * 获取存储模式（便捷函数）
 */
export async function getStorageMode(): Promise<'local' | 'oss'> {
  return await ossService.checkStorageMode();
}

/**
 * 获取 STS 凭证（便捷函数）
 */
export async function getSTSCredentials(): Promise<STSCredentials> {
  return await ossService.getSTSCredentials();
}
