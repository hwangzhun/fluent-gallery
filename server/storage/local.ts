/**
 * 本地存储服务
 */

import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { loadStorageConfig, resolveLocalUploadDir } from '../storage/config';

/**
 * 确保上传目录存在
 */
async function ensureUploadDir(): Promise<string> {
  const storageConfig = await loadStorageConfig();
  const config = storageConfig.local;
  if (!config) {
    throw new Error('本地存储配置不存在');
  }

  const uploadDir = resolveLocalUploadDir(config.uploadDir);
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }

  // 创建子目录：photos 和 thumbs
  const photosDir = join(uploadDir, 'photos');
  const thumbsDir = join(uploadDir, 'thumbs');
  
  if (!existsSync(photosDir)) {
    mkdirSync(photosDir, { recursive: true });
  }
  if (!existsSync(thumbsDir)) {
    mkdirSync(thumbsDir, { recursive: true });
  }

  return uploadDir;
}

/**
 * 生成文件路径（按月份组织）
 */
function generateFilePath(originalName: string, isThumbnail = false): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const ext = originalName.split('.').pop() || 'jpg';
  const fileName = `${uuidv4()}.${ext}`;
  const subDir = isThumbnail ? 'thumbs' : 'photos';
  
  return `${subDir}/${year}/${month}/${fileName}`;
}

/**
 * 上传文件到本地存储
 */
export async function uploadLocalFile(
  file: Express.Multer.File,
  generateThumbnail = true
): Promise<{
  url: string;
  thumbnailUrl: string;
  path: string;
  thumbnailPath: string;
  size: number;
  width: number;
  height: number;
}> {
  const storageConfig = await loadStorageConfig();
  const config = storageConfig.local;
  if (!config) {
    throw new Error('本地存储配置不存在');
  }

  const uploadDir = await ensureUploadDir();
  
  // 生成文件路径
  const filePath = generateFilePath(file.originalname, false);
  const thumbnailPath = generateFilePath(file.originalname, true);
  
  const fullPath = join(uploadDir, filePath);
  const fullThumbnailPath = join(uploadDir, thumbnailPath);

  // 确保目录存在
  mkdirSync(dirname(fullPath), { recursive: true });
  mkdirSync(dirname(fullThumbnailPath), { recursive: true });

  // 获取图片信息
  const image = sharp(file.buffer);
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  // 保存原图
  await image.toFile(fullPath);

  // 生成缩略图（最大宽度 600px）
  let thumbnailUrl = '';
  if (generateThumbnail && width > 0 && height > 0) {
    await image
      .resize(600, null, {
        withoutEnlargement: true,
        fit: 'inside'
      })
      .toFile(fullThumbnailPath);
    
    thumbnailUrl = `${config.publicUrl}/${thumbnailPath}`;
  } else {
    thumbnailUrl = `${config.publicUrl}/${filePath}`;
  }

  return {
    url: `${config.publicUrl}/${filePath}`,
    thumbnailUrl,
    path: filePath,
    thumbnailPath,
    size: file.size,
    width,
    height
  };
}

/**
 * 删除本地文件
 */
export async function deleteLocalFile(url: string): Promise<void> {
  const storageConfig = await loadStorageConfig();
  const config = storageConfig.local;
  if (!config) {
    throw new Error('本地存储配置不存在');
  }

  try {
    // 从 URL 中提取文件路径
    // 例如：http://localhost:3001/uploads/photos/2024/01/xxx.jpg
    // 提取：photos/2024/01/xxx.jpg
    const urlObj = new URL(url, 'http://local');
    const relativePath = urlObj.pathname.replace('/uploads/', '');
    
    const uploadDir = resolveLocalUploadDir(config.uploadDir);
    const fullPath = join(uploadDir, relativePath);

    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
      console.log(`✅ 已删除本地文件: ${relativePath}`);
    }
  } catch (error) {
    console.error('删除本地文件失败:', error);
    throw error;
  }
}

/**
 * 从 URL 判断是否为本地 URL
 */
export function isLocalURL(url: string): boolean {
  try {
    const urlObj = new URL(url, 'http://local');
    return urlObj.pathname.startsWith('/uploads/');
  } catch {
    return false;
  }
}
