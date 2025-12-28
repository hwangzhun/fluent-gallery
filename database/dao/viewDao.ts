import { dbRun, dbGet, dbAll } from '../db';

/**
 * 浏览量记录实体
 */
export interface ViewEntity {
  id: number;
  photo_id: string;
  fingerprint: string;
  ip_address: string | null;
  created_at: string;
}

/**
 * 浏览量数据访问对象
 */
export class ViewDao {
  /**
   * 浏览量时间窗口（24小时，单位：毫秒）
   * 同一指纹在24小时内只统计一次浏览量
   */
  private readonly VIEW_TIME_WINDOW = 24 * 60 * 60 * 1000;

  /**
   * 检查指定指纹在时间窗口内是否已浏览
   */
  async hasViewedInTimeWindow(
    photoId: string,
    fingerprint: string,
    timeWindowMs: number = this.VIEW_TIME_WINDOW
  ): Promise<boolean> {
    const cutoffTime = new Date(Date.now() - timeWindowMs).toISOString();
    
    const view = await dbGet<ViewEntity>(
      `SELECT * FROM photo_views 
       WHERE photo_id = ? AND fingerprint = ? AND created_at > ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [photoId, fingerprint, cutoffTime]
    );

    return !!view;
  }

  /**
   * 添加浏览量记录
   */
  async addView(
    photoId: string,
    fingerprint: string,
    ipAddress?: string
  ): Promise<ViewEntity> {
    // 1. 插入浏览量记录
    const result = await dbRun(
      `INSERT INTO photo_views (photo_id, fingerprint, ip_address, created_at)
       VALUES (?, ?, ?, ?)`,
      [photoId, fingerprint, ipAddress || null, new Date().toISOString()]
    );

    // 2. 更新照片的浏览量
    await dbRun(
      `UPDATE photos 
       SET views_count = (
         SELECT COUNT(*) 
         FROM photo_views 
         WHERE photo_id = ?
       )
       WHERE id = ?`,
      [photoId, photoId]
    );

    // 3. 返回浏览量记录
    const view = await dbGet<ViewEntity>(
      'SELECT * FROM photo_views WHERE id = ?',
      [result.lastID]
    );

    if (!view) {
      throw new Error('创建浏览量记录失败');
    }

    return view;
  }

  /**
   * 获取照片的浏览量
   */
  async getViewCount(photoId: string): Promise<number> {
    const result = await dbGet<{ views_count: number }>(
      'SELECT views_count FROM photos WHERE id = ?',
      [photoId]
    );

    return result?.views_count || 0;
  }

  /**
   * 检查指定指纹是否已浏览（不考虑时间窗口）
   */
  async hasViewed(photoId: string, fingerprint: string): Promise<boolean> {
    const view = await dbGet<ViewEntity>(
      'SELECT * FROM photo_views WHERE photo_id = ? AND fingerprint = ? LIMIT 1',
      [photoId, fingerprint]
    );

    return !!view;
  }

  /**
   * 获取照片的所有浏览量记录（可选：用于管理）
   */
  async getViewsByPhotoId(photoId: string): Promise<ViewEntity[]> {
    return await dbAll<ViewEntity>(
      'SELECT * FROM photo_views WHERE photo_id = ? ORDER BY created_at DESC',
      [photoId]
    );
  }

  /**
   * 批量获取照片的浏览量
   */
  async getViewCounts(photoIds: string[]): Promise<Record<string, number>> {
    if (photoIds.length === 0) {
      return {};
    }

    const placeholders = photoIds.map(() => '?').join(',');
    const photos = await dbAll<{ id: string; views_count: number }>(
      `SELECT id, views_count FROM photos WHERE id IN (${placeholders})`,
      photoIds
    );

    const result: Record<string, number> = {};
    for (const photo of photos) {
      result[photo.id] = photo.views_count || 0;
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

