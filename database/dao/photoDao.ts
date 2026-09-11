import { dbRun, dbGet, dbAll, withTransaction } from '../db';
import { setPhotoAlbums } from './albumDao';
import type { PhotoEntity, PhotoWithTags, CreatePhotoInput, UpdatePhotoInput, ExifInfo } from '../types';

export type PhotoSort = 'latest' | 'likes' | 'views';
export interface PhotoCursor { createdAt: string; id: string }

/**
 * 照片数据访问对象
 */
export class PhotoDao {
  private buildPhotoFilter(options: { albumId?: string; year?: number; tags?: string[]; search?: string } = {}) {
    const where: string[] = [];
    const params: unknown[] = [];

    if (options.albumId) {
      where.push('EXISTS (SELECT 1 FROM album_photos ap WHERE ap.photo_id = p.id AND ap.album_id = ?)');
      params.push(options.albumId);
    }
    if (options.year) {
      where.push('p.year = ?');
      params.push(options.year);
    }

    if (options.search?.trim()) {
      const term = `%${options.search.trim().toLowerCase()}%`;
      where.push(`(
        LOWER(p.title) LIKE ? OR LOWER(COALESCE(p.description, '')) LIKE ? OR LOWER(COALESCE(p.exif, '')) LIKE ?
        OR EXISTS (
          SELECT 1 FROM photo_tags search_pt INNER JOIN tags search_t ON search_t.id = search_pt.tag_id
          WHERE search_pt.photo_id = p.id AND LOWER(search_t.name) LIKE ?
        )
      )`);
      params.push(term, term, term, term);
    }

    const tags = [...new Set((options.tags || []).filter(Boolean))];
    if (tags.length > 0) {
      const placeholders = tags.map(() => '?').join(', ');
      where.push(`p.id IN (
        SELECT pt.photo_id FROM photo_tags pt INNER JOIN tags t ON t.id = pt.tag_id
        WHERE t.name IN (${placeholders}) GROUP BY pt.photo_id
        HAVING COUNT(DISTINCT t.name) = ?
      )`);
      params.push(...tags, tags.length);
    }

    return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  private async attachTags(photos: PhotoEntity[]): Promise<PhotoWithTags[]> {
    if (photos.length === 0) return [];
    const ids = photos.map(photo => photo.id);
    const tagRows = await dbAll<{ photo_id: string; name: string }>(
      `SELECT pt.photo_id, t.name FROM photo_tags pt
       INNER JOIN tags t ON t.id = pt.tag_id
       WHERE pt.photo_id IN (${ids.map(() => '?').join(', ')})
       ORDER BY t.name ASC`,
      ids
    );
    const tagsByPhoto = new Map<string, string[]>();
    tagRows.forEach(({ photo_id, name }) => tagsByPhoto.set(photo_id, [...(tagsByPhoto.get(photo_id) || []), name]));
    return photos.map(photo => ({ ...photo, tags: tagsByPhoto.get(photo.id) || [] }));
  }

  private async attachAlbums(photos: PhotoWithTags[]): Promise<PhotoWithTags[]> {
    if (photos.length === 0) return [];
    const rows = await dbAll<{ photo_id: string; id: string; name: string }>(
      `SELECT ap.photo_id, a.id, a.name
       FROM album_photos ap INNER JOIN albums a ON a.id = ap.album_id
       WHERE ap.photo_id IN (${photos.map(() => '?').join(', ')})
       ORDER BY a.position, a.id`,
      photos.map(photo => photo.id),
    );
    const albumsByPhoto = new Map<string, { id: string; name: string }[]>();
    rows.forEach(({ photo_id, id, name }) => albumsByPhoto.set(photo_id, [...(albumsByPhoto.get(photo_id) || []), { id, name }]));
    return photos.map(photo => ({ ...photo, albums: albumsByPhoto.get(photo.id) || [] }));
  }

  async getPhotosWithTagsByIds(ids: string[]): Promise<PhotoWithTags[]> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return [];
    const rows = await dbAll<PhotoEntity>(
      `SELECT * FROM photos WHERE id IN (${uniqueIds.map(() => '?').join(', ')})`,
      uniqueIds,
    );
    const withTags = await this.attachTags(rows);
    const byId = new Map(withTags.map(photo => [photo.id, photo]));
    return ids.flatMap(id => {
      const photo = byId.get(id);
      return photo ? [photo] : [];
    });
  }

  /**
   * 组合筛选照片。多个标签采用 AND 语义：结果必须同时具备全部标签。
   * 标签使用一次批量查询回填，避免列表读取时的 N+1 查询。
   */
  async getPhotos(options: { albumId?: string; year?: number; tags?: string[]; search?: string } = {}): Promise<PhotoWithTags[]> {
    const filter = this.buildPhotoFilter(options);
    const photos = await dbAll<PhotoEntity>(
      `SELECT p.* FROM photos p ${filter.clause} ORDER BY p.created_at DESC, p.id DESC`,
      filter.params as any[]
    );
    return this.attachTags(photos);
  }

  async getPhotosCursorPage(options: { limit: number; cursor?: PhotoCursor; year?: number; tags?: string[]; search?: string }) {
    const filter = this.buildPhotoFilter(options);
    const cursorClause = options.cursor
      ? `${filter.clause ? ' AND' : 'WHERE'} (p.created_at < ? OR (p.created_at = ? AND p.id < ?))`
      : '';
    const cursorParams = options.cursor ? [options.cursor.createdAt, options.cursor.createdAt, options.cursor.id] : [];
    const rows = await dbAll<PhotoEntity>(
      `SELECT p.* FROM photos p ${filter.clause}${cursorClause}
       ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
      [...filter.params, ...cursorParams, options.limit + 1] as any[]
    );
    const hasMore = rows.length > options.limit;
    const pageRows = rows.slice(0, options.limit);
    const totalRow = await dbGet<{ total: number }>(
      `SELECT COUNT(*) AS total FROM photos p ${filter.clause}`,
      filter.params as any[]
    );
    return {
      items: await this.attachTags(pageRows),
      total: totalRow?.total || 0,
      hasMore,
      nextCursor: hasMore && pageRows.length
        ? { createdAt: pageRows[pageRows.length - 1].created_at, id: pageRows[pageRows.length - 1].id }
        : null,
    };
  }

  async getPhotosPage(options: { page: number; pageSize: number; albumId?: string; year?: number; tags?: string[]; search?: string; sort?: PhotoSort }) {
    const filter = this.buildPhotoFilter(options);
    const orderBy = options.sort === 'likes'
      ? 'p.likes_count DESC, p.created_at DESC, p.id DESC'
      : options.sort === 'views'
        ? 'p.views_count DESC, p.created_at DESC, p.id DESC'
        : 'p.created_at DESC, p.id DESC';
    const totalRow = await dbGet<{ total: number }>(
      `SELECT COUNT(*) AS total FROM photos p ${filter.clause}`,
      filter.params as any[]
    );
    const total = totalRow?.total || 0;
    const photos = await dbAll<PhotoEntity>(
      `SELECT p.* FROM photos p ${filter.clause}
       ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...filter.params, options.pageSize, (options.page - 1) * options.pageSize] as any[]
    );
    return {
      items: await this.attachAlbums(await this.attachTags(photos)),
      total,
      page: options.page,
      pageSize: options.pageSize,
      totalPages: total === 0 ? 0 : Math.ceil(total / options.pageSize),
    };
  }

  async getAvailableYears(): Promise<number[]> {
    const rows = await dbAll<{ year: number }>('SELECT DISTINCT year FROM photos ORDER BY year DESC');
    return rows.map(row => row.year);
  }

  /**
   * 创建照片（包含标签关联）
   */
  async createPhoto(input: CreatePhotoInput, photoId: string): Promise<PhotoEntity> {
    return withTransaction(async () => {
      const photo = await this.createPhotoRecord(input, photoId);
      if (input.albumIds !== undefined) await setPhotoAlbums(photoId, input.albumIds, input.albumBeforePhotoIds);
      return photo;
    });
  }
  private async createPhotoRecord(input: CreatePhotoInput, photoId: string): Promise<PhotoEntity> {
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
    return withTransaction(async () => {
      const photo = await this.updatePhotoRecord(id, input);
      if (photo && input.albumIds !== undefined) await setPhotoAlbums(id, input.albumIds);
      return photo;
    });
  }
  private async updatePhotoRecord(id: string, input: UpdatePhotoInput): Promise<PhotoEntity | null> {
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

  /** Apply the limited set of safe bulk changes as one database transaction. */
  async batchUpdatePhotos(ids: string[], changes: {
    year?: number;
    exif?: Record<string, string>;
    tags?: { mode: 'append' | 'remove' | 'replace'; values: string[] };
  }): Promise<number> {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) throw new Error('请至少选择一张照片');
    const existing = await this.getPhotos({});
    const selected = existing.filter(photo => uniqueIds.includes(photo.id));
    if (selected.length !== uniqueIds.length) throw new Error('部分照片不存在或已被删除');

    return withTransaction(async () => {
      for (const photo of selected) {
        const input: UpdatePhotoInput = {};
        if (changes.year !== undefined) input.year = changes.year;
        if (changes.exif && Object.keys(changes.exif).length) {
          let currentExif: Record<string, string> = {};
          try { currentExif = photo.exif ? JSON.parse(photo.exif) : {}; } catch { currentExif = {}; }
          input.exif = { ...currentExif, ...changes.exif } as unknown as ExifInfo;
        }
        if (changes.tags) {
          const values = [...new Set(changes.tags.values.map(value => value.trim()).filter(Boolean))];
          const current = photo.tags;
          input.tags = changes.tags.mode === 'replace'
            ? values
            : changes.tags.mode === 'append'
              ? [...new Set([...current, ...values])]
              : current.filter(tag => !values.includes(tag));
        }
        await this.updatePhoto(photo.id, input);
      }
      return selected.length;
    });
  }

  /**
   * 删除照片
   */
  async deletePhoto(id: string): Promise<boolean> {
    const result = await dbRun('DELETE FROM photos WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async batchDeletePhotos(ids: string[]): Promise<number> {
    const uniqueIds = [...new Set(ids)];
    return withTransaction(async () => {
      for (const id of uniqueIds) {
        const result = await dbRun('DELETE FROM photos WHERE id = ?', [id]);
        if (result.changes !== 1) throw new Error(`照片不存在或已被删除：${id}`);
      }
      return uniqueIds.length;
    });
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
