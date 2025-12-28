import { dbRun, dbGet, dbAll } from '../db';
import type { PhotoEntity, PhotoWithTags, CreatePhotoInput, UpdatePhotoInput, ExifInfo } from '../types';

/**
 * 照片数据访问对象
 */
export class PhotoDao {
  /**
   * 创建照片（包含标签关联）
   */
  async createPhoto(input: CreatePhotoInput, photoId: string): Promise<PhotoEntity> {
    const exifJson = input.exif ? JSON.stringify(input.exif) : null;
    const now = new Date().toISOString();

    // 1. 插入照片记录
    await dbRun(
      `INSERT INTO photos (id, url, thumbnail_url, title, description, year, width, height, exif, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        photoId,
        input.url,
        input.thumbnail_url,
        input.title,
        input.description || null,
        input.year,
        input.width,
        input.height,
        exifJson,
        now,
        now
      ]
    );

    // 2. 处理标签关联
    if (input.tags && input.tags.length > 0) {
      await this.associateTags(photoId, input.tags);
    }

    // 3. 返回创建的照片
    const photo = await this.getPhotoById(photoId);
    if (!photo) {
      throw new Error('创建照片后无法查询到记录');
    }
    return photo;
  }

  /**
   * 根据 ID 获取照片（不包含标签）
   */
  async getPhotoById(id: string): Promise<PhotoEntity | null> {
    const photo = await dbGet<PhotoEntity>(
      'SELECT * FROM photos WHERE id = ?',
      [id]
    );
    return photo || null;
  }

  /**
   * 根据 ID 获取照片（包含标签）
   */
  async getPhotoWithTagsById(id: string): Promise<PhotoWithTags | null> {
    const photo = await this.getPhotoById(id);
    if (!photo) {
      return null;
    }

    const tags = await this.getPhotoTags(id);
    return {
      ...photo,
      tags
    };
  }

  /**
   * 获取所有照片（包含标签）
   */
  async getAllPhotos(): Promise<PhotoWithTags[]> {
    const photos = await dbAll<PhotoEntity>(
      'SELECT * FROM photos ORDER BY created_at DESC'
    );

    // 为每张照片获取标签
    const photosWithTags = await Promise.all(
      photos.map(async (photo) => {
        const tags = await this.getPhotoTags(photo.id);
        return {
          ...photo,
          tags
        };
      })
    );

    return photosWithTags;
  }

  /**
   * 按年份筛选照片
   */
  async getPhotosByYear(year: number): Promise<PhotoWithTags[]> {
    const photos = await dbAll<PhotoEntity>(
      'SELECT * FROM photos WHERE year = ? ORDER BY created_at DESC',
      [year]
    );

    const photosWithTags = await Promise.all(
      photos.map(async (photo) => {
        const tags = await this.getPhotoTags(photo.id);
        return {
          ...photo,
          tags
        };
      })
    );

    return photosWithTags;
  }

  /**
   * 按标签筛选照片
   */
  async getPhotosByTag(tagName: string): Promise<PhotoWithTags[]> {
    const photos = await dbAll<PhotoEntity>(
      `SELECT DISTINCT p.*
       FROM photos p
       INNER JOIN photo_tags pt ON p.id = pt.photo_id
       INNER JOIN tags t ON pt.tag_id = t.id
       WHERE t.name = ?
       ORDER BY p.created_at DESC`,
      [tagName]
    );

    const photosWithTags = await Promise.all(
      photos.map(async (photo) => {
        const tags = await this.getPhotoTags(photo.id);
        return {
          ...photo,
          tags
        };
      })
    );

    return photosWithTags;
  }

  /**
   * 按年份和标签筛选照片
   */
  async getPhotosByYearAndTag(year: number, tagName: string): Promise<PhotoWithTags[]> {
    const photos = await dbAll<PhotoEntity>(
      `SELECT DISTINCT p.*
       FROM photos p
       INNER JOIN photo_tags pt ON p.id = pt.photo_id
       INNER JOIN tags t ON pt.tag_id = t.id
       WHERE p.year = ? AND t.name = ?
       ORDER BY p.created_at DESC`,
      [year, tagName]
    );

    const photosWithTags = await Promise.all(
      photos.map(async (photo) => {
        const tags = await this.getPhotoTags(photo.id);
        return {
          ...photo,
          tags
        };
      })
    );

    return photosWithTags;
  }

  /**
   * 更新照片
   */
  async updatePhoto(id: string, input: UpdatePhotoInput): Promise<PhotoEntity | null> {
    const existingPhoto = await this.getPhotoById(id);
    if (!existingPhoto) {
      return null;
    }

    // 构建更新字段
    const updates: string[] = [];
    const values: any[] = [];

    if (input.url !== undefined) {
      updates.push('url = ?');
      values.push(input.url);
    }
    if (input.thumbnail_url !== undefined) {
      updates.push('thumbnail_url = ?');
      values.push(input.thumbnail_url);
    }
    if (input.title !== undefined) {
      updates.push('title = ?');
      values.push(input.title);
    }
    if (input.description !== undefined) {
      updates.push('description = ?');
      values.push(input.description || null);
    }
    if (input.year !== undefined) {
      updates.push('year = ?');
      values.push(input.year);
    }
    if (input.width !== undefined) {
      updates.push('width = ?');
      values.push(input.width);
    }
    if (input.height !== undefined) {
      updates.push('height = ?');
      values.push(input.height);
    }
    if (input.exif !== undefined) {
      updates.push('exif = ?');
      values.push(input.exif ? JSON.stringify(input.exif) : null);
    }

    // 更新 updated_at
    updates.push('updated_at = ?');
    values.push(new Date().toISOString());

    if (updates.length === 1) {
      // 只更新了 updated_at，没有其他字段需要更新
      if (input.tags !== undefined) {
        // 只更新标签
        await this.updatePhotoTags(id, input.tags);
        return await this.getPhotoById(id);
      }
      return existingPhoto;
    }

    values.push(id);
    await dbRun(
      `UPDATE photos SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // 更新标签（如果提供）
    if (input.tags !== undefined) {
      await this.updatePhotoTags(id, input.tags);
    }

    return await this.getPhotoById(id);
  }

  /**
   * 删除照片
   */
  async deletePhoto(id: string): Promise<boolean> {
    const result = await dbRun('DELETE FROM photos WHERE id = ?', [id]);
    return result.changes > 0;
  }

  /**
   * 获取照片的标签名称数组
   */
  async getPhotoTags(photoId: string): Promise<string[]> {
    const tags = await dbAll<{ name: string }>(
      `SELECT t.name
       FROM tags t
       INNER JOIN photo_tags pt ON t.id = pt.tag_id
       WHERE pt.photo_id = ?`,
      [photoId]
    );
    return tags.map(t => t.name);
  }

  /**
   * 关联标签到照片
   */
  private async associateTags(photoId: string, tagNames: string[]): Promise<void> {
    const { TagDao } = await import('./tagDao');
    const tagDao = new TagDao();

    for (const tagName of tagNames) {
      // 确保标签存在
      const tag = await tagDao.getOrCreateTag(tagName);
      
      // 关联照片和标签
      await dbRun(
        'INSERT OR IGNORE INTO photo_tags (photo_id, tag_id) VALUES (?, ?)',
        [photoId, tag.id]
      );
    }
  }

  /**
   * 更新照片的标签
   */
  private async updatePhotoTags(photoId: string, tagNames: string[]): Promise<void> {
    // 1. 删除所有现有关联
    await dbRun('DELETE FROM photo_tags WHERE photo_id = ?', [photoId]);
    
    // 2. 创建新的关联
    if (tagNames.length > 0) {
      await this.associateTags(photoId, tagNames);
    }
  }
}

