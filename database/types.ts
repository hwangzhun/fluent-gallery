// 数据库实体类型定义

/**
 * 照片数据库实体（对应 photos 表）
 */
export interface PhotoEntity {
  id: string;
  url: string;
  thumbnail_url: string;
  title: string;
  description: string | null;
  year: number;
  width: number;
  height: number;
  exif: string | null; // JSON 字符串
  created_at: string;
  updated_at: string;
}

/**
 * 标签数据库实体（对应 tags 表）
 */
export interface TagEntity {
  id: number;
  name: string;
  created_at: string;
}

/**
 * 照片标签关联实体（对应 photo_tags 表）
 */
export interface PhotoTagEntity {
  photo_id: string;
  tag_id: number;
}

/**
 * 照片查询结果（包含标签数组）
 */
export interface PhotoWithTags extends PhotoEntity {
  tags: string[]; // 标签名称数组
  likes_count?: number; // 点赞数（可选，因为可能是旧数据）
  views_count?: number; // 浏览量（可选，因为可能是旧数据）
}

/**
 * EXIF 信息类型
 */
export interface ExifInfo {
  camera: string;
  lens: string;
  aperture: string;
  shutterSpeed: string;
  iso: string;
  author?: string;
  copyright?: string;
  city?: string;
  province?: string;
  country?: string;
}

/**
 * 创建照片的输入数据（不包含自动生成的字段）
 */
export interface CreatePhotoInput {
  url: string;
  thumbnail_url: string;
  title: string;
  description?: string;
  year: number;
  width: number;
  height: number;
  exif?: ExifInfo;
  tags: string[]; // 标签名称数组
}

/**
 * 更新照片的输入数据（所有字段可选）
 */
export interface UpdatePhotoInput {
  url?: string;
  thumbnail_url?: string;
  title?: string;
  description?: string;
  year?: number;
  width?: number;
  height?: number;
  exif?: ExifInfo;
  tags?: string[]; // 标签名称数组
}

