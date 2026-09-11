/**
 * 存储服务统一接口
 */
import { deleteOSSFile, extractPathFromOSSUrl, normalizePublicUrl } from './oss';
import { loadStorageConfig } from './config';
import { unlinkSync, existsSync } from 'fs';
import { isAbsolute, join } from 'path';

/**
 * 判断 URL 是否为 OSS URL
 */
function isOSSUrl(url: string, publicUrl?: string): boolean {
  try {
    const urlObj = new URL(url);
    const configuredHost = publicUrl ? new URL(normalizePublicUrl(publicUrl)).host : '';
    // 检查是否是 OSS 域名（常见格式）
    return urlObj.hostname.includes('oss-') || 
           urlObj.hostname.includes('aliyuncs.com') ||
           urlObj.hostname.includes('amazonaws.com') ||
           urlObj.hostname.includes('qcloud.com') ||
           Boolean(configuredHost && urlObj.host === configuredHost);
  } catch {
    return false;
  }
}

/**
 * 删除文件（自动判断存储方式）
 */
export async function deleteFile(url: string, objectKey?: string | null): Promise<void> {
  if (!url) {
    return;
  }

  const currentConfig = await loadStorageConfig();
  if (currentConfig.mode === 'oss' && objectKey) {
    await deleteOSSFile(objectKey.replace(/^\/+/, ''));
    return;
  }
  // 判断是否为 OSS URL（包括已配置的自定义访问域名）
  if (isOSSUrl(url, currentConfig.oss?.publicUrl)) {
    // OSS 文件删除
    const path = extractPathFromOSSUrl(url);
    if (path) {
      await deleteOSSFile(path);
    } else {
      throw new Error(`无法从 OSS URL 提取路径: ${url}`);
    }
  } else {
    // 本地文件删除
    if (currentConfig.mode === 'local' && currentConfig.local) {
      // 从 URL 提取文件路径
      let filePath = url;
      
      // 如果是完整 URL，提取路径部分
      if (url.startsWith('http://') || url.startsWith('https://')) {
        try {
          const urlObj = new URL(url);
          filePath = urlObj.pathname;
        } catch {
          // 如果解析失败，使用原始 URL
        }
      }
      
      // 移除开头的 /uploads
      if (filePath.startsWith('/uploads/')) {
        filePath = filePath.substring('/uploads/'.length);
      }
      
      // 构建完整路径
      const uploadRoot = isAbsolute(currentConfig.local.uploadDir) ? currentConfig.local.uploadDir : join(process.cwd(), currentConfig.local.uploadDir.replace('./', ''));
      const fullPath = join(uploadRoot, filePath);
      
      // 检查文件是否存在并删除
      if (existsSync(fullPath)) {
        unlinkSync(fullPath);
        console.log(`✅ 已删除本地文件: ${fullPath}`);
      } else {
        console.warn(`⚠️  本地文件不存在: ${fullPath}`);
      }
    } else {
      throw new Error(`当前存储模式不是本地，无法删除本地文件: ${url}`);
    }
  }
}
