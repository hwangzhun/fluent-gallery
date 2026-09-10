import type { Photo } from '../types';
import type { PhotoWithTags } from '../database/types';

/**
 * 将数据库实体转换为前端 Photo 类型
 */
export function dbPhotoToPhoto(dbPhoto: PhotoWithTags): Photo {
  // 解析 EXIF JSON
  let exif = undefined;
  if (dbPhoto.exif) {
    try {
      exif = JSON.parse(dbPhoto.exif);
    } catch (e) {
      console.warn('解析 EXIF 失败:', e);
    }
  }

  return {
    id: dbPhoto.id,
    url: dbPhoto.url,
    thumbnailUrl: dbPhoto.thumbnail_url,
    title: dbPhoto.title,
    description: dbPhoto.description || undefined,
    tags: dbPhoto.tags,
    year: dbPhoto.year,
    width: dbPhoto.width,
    height: dbPhoto.height,
    createdAt: dbPhoto.created_at,
    likesCount: dbPhoto.likes_count || 0,
    viewsCount: dbPhoto.views_count || 0,
    exif
  };
}

/**
 * 将前端 Photo 类型转换为创建照片的输入数据
 */
export function photoToCreateInput(photo: Omit<Photo, 'id' | 'createdAt' | 'likesCount' | 'viewsCount' | 'isLiked'>): {
  url: string;
  thumbnail_url: string;
  title: string;
  description?: string;
  year: number;
  width: number;
  height: number;
  exif?: any;
  tags: string[];
} {
  return {
    url: photo.url,
    thumbnail_url: photo.thumbnailUrl,
    title: photo.title,
    description: photo.description,
    year: photo.year,
    width: photo.width,
    height: photo.height,
    exif: photo.exif,
    tags: photo.tags
  };
}
