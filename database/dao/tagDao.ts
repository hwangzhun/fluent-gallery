import { dbRun, dbGet, dbAll } from '../db';
import type { TagEntity, TagWithCountEntity } from '../types';

/**
 * 标签数据访问对象
 */
export class TagDao {
  /**
   * 创建标签
   */
  async createTag(name: string): Promise<TagEntity> {
    const now = new Date().toISOString();
    await dbRun(
      'INSERT INTO tags (name, created_at) VALUES (?, ?)',
      [name, now]
    );

    const tag = await this.getTagByName(name);
    if (!tag) {
      throw new Error('创建标签后无法查询到记录');
    }
    return tag;
  }

  /**
   * 根据名称获取标签
   */
  async getTagByName(name: string): Promise<TagEntity | null> {
    const tag = await dbGet<TagEntity>(
      'SELECT * FROM tags WHERE name = ?',
      [name]
    );
    return tag || null;
  }

  /**
   * 根据 ID 获取标签
   */
  async getTagById(id: number): Promise<TagEntity | null> {
    const tag = await dbGet<TagEntity>(
      'SELECT * FROM tags WHERE id = ?',
      [id]
    );
    return tag || null;
  }

  /**
   * 获取所有标签
   */
  async getAllTags(): Promise<TagEntity[]> {
    return await dbAll<TagEntity>(
      'SELECT * FROM tags ORDER BY name ASC'
    );
  }

  async getAllTagsWithPhotoCount(): Promise<TagWithCountEntity[]> {
    return dbAll<TagWithCountEntity>(
      `SELECT t.id, t.name, t.created_at, COUNT(pt.photo_id) AS photo_count
       FROM tags t
       LEFT JOIN photo_tags pt ON pt.tag_id = t.id
       GROUP BY t.id, t.name, t.created_at
       ORDER BY t.name ASC`
    );
  }

  async renameTag(id: number, name: string): Promise<TagEntity | null> {
    const result = await dbRun('UPDATE tags SET name = ? WHERE id = ?', [name, id]);
    return result.changes > 0 ? this.getTagById(id) : null;
  }

  /**
   * 获取或创建标签（如果不存在则创建）
   */
  async getOrCreateTag(name: string): Promise<TagEntity> {
    let tag = await this.getTagByName(name);
    if (!tag) {
      tag = await this.createTag(name);
    }
    return tag;
  }

  /**
   * 删除标签
   */
  async deleteTag(id: number): Promise<boolean> {
    const result = await dbRun('DELETE FROM tags WHERE id = ?', [id]);
    return result.changes > 0;
  }

  /**
   * 获取所有标签名称（用于前端筛选）
   */
  async getAllTagNames(): Promise<string[]> {
    const tags = await this.getAllTags();
    return tags.map(t => t.name);
  }
}
