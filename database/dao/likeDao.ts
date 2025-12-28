import { dbRun, dbGet, dbAll } from '../db';

/**
 * 点赞记录实体
 */
export interface LikeEntity {
  id: number;
  photo_id: string;
  fingerprint: string;
  ip_address: string | null;
  created_at: string;
}

/**
 * 点赞数据访问对象
 */
export class LikeDao {
  /**
   * 点赞时间窗口（24小时，单位：毫秒）
   */
  private readonly LIKE_TIME_WINDOW = 24 * 60 * 60 * 1000;

  /**
   * 检查指定指纹在时间窗口内是否已点赞
   */
  async hasLikedInTimeWindow(
    photoId: string,
    fingerprint: string,
    timeWindowMs: number = this.LIKE_TIME_WINDOW
  ): Promise<boolean> {
    const cutoffTime = new Date(Date.now() - timeWindowMs).toISOString();
    
    const like = await dbGet<LikeEntity>(
      `SELECT * FROM photo_likes 
       WHERE photo_id = ? AND fingerprint = ? AND created_at > ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [photoId, fingerprint, cutoffTime]
    );

    return !!like;
  }

  /**
   * 添加点赞记录
   */
  async addLike(
    photoId: string,
    fingerprint: string,
    ipAddress?: string
  ): Promise<LikeEntity> {
    // 1. 插入点赞记录
    const result = await dbRun(
      `INSERT INTO photo_likes (photo_id, fingerprint, ip_address, created_at)
       VALUES (?, ?, ?, ?)`,
      [photoId, fingerprint, ipAddress || null, new Date().toISOString()]
    );

    // 2. 更新照片的点赞数
    await dbRun(
      `UPDATE photos 
       SET likes_count = (
         SELECT COUNT(*) 
         FROM photo_likes 
         WHERE photo_id = ?
       )
       WHERE id = ?`,
      [photoId, photoId]
    );

    // 3. 返回点赞记录
    const like = await dbGet<LikeEntity>(
      'SELECT * FROM photo_likes WHERE id = ?',
      [result.lastID]
    );

    if (!like) {
      throw new Error('创建点赞记录失败');
    }

    return like;
  }

  /**
   * 获取照片的点赞数
   */
  async getLikeCount(photoId: string): Promise<number> {
    const result = await dbGet<{ likes_count: number }>(
      'SELECT likes_count FROM photos WHERE id = ?',
      [photoId]
    );

    return result?.likes_count || 0;
  }

  /**
   * 检查指定指纹是否已点赞（不考虑时间窗口）
   */
  async hasLiked(photoId: string, fingerprint: string): Promise<boolean> {
    const like = await dbGet<LikeEntity>(
      'SELECT * FROM photo_likes WHERE photo_id = ? AND fingerprint = ? LIMIT 1',
      [photoId, fingerprint]
    );

    return !!like;
  }

  /**
   * 获取照片的所有点赞记录（可选：用于管理）
   */
  async getLikesByPhotoId(photoId: string): Promise<LikeEntity[]> {
    return await dbAll<LikeEntity>(
      'SELECT * FROM photo_likes WHERE photo_id = ? ORDER BY created_at DESC',
      [photoId]
    );
  }

  /**
   * 删除点赞记录（可选：用于管理）
   */
  async deleteLike(photoId: string, fingerprint: string): Promise<boolean> {
    const result = await dbRun(
      'DELETE FROM photo_likes WHERE photo_id = ? AND fingerprint = ?',
      [photoId, fingerprint]
    );

    if (result.changes > 0) {
      // 更新照片的点赞数
      await dbRun(
        `UPDATE photos 
         SET likes_count = (
           SELECT COUNT(*) 
           FROM photo_likes 
           WHERE photo_id = ?
         )
         WHERE id = ?`,
        [photoId, photoId]
      );
    }

    return result.changes > 0;
  }

  /**
   * 批量获取照片的点赞数
   */
  async getLikeCounts(photoIds: string[]): Promise<Record<string, number>> {
    if (photoIds.length === 0) {
      return {};
    }

    const placeholders = photoIds.map(() => '?').join(',');
    const photos = await dbAll<{ id: string; likes_count: number }>(
      `SELECT id, likes_count FROM photos WHERE id IN (${placeholders})`,
      photoIds
    );

    const result: Record<string, number> = {};
    for (const photo of photos) {
      result[photo.id] = photo.likes_count || 0;
    }

    // 确保所有请求的 photoId 都有值
    for (const photoId of photoIds) {
      if (!(photoId in result)) {
        result[photoId] = 0;
      }
    }

    return result;
  }
}

