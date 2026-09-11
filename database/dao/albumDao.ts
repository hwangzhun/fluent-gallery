import { randomUUID } from 'node:crypto';
import { dbAll, dbGet, dbRun, withTransaction } from '../db';
import { PhotoDao } from './photoDao';

export class AlbumInputError extends Error {}
export interface AlbumRow {
  id: string; name: string; description: string; published: number;
  cover_photo_id: string | null; position: number; created_at: string; updated_at: string;
}
export function idsInput(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(id => typeof id === 'string' && id.trim())) throw new AlbumInputError('画册或照片 ID 列表无效');
  return [...new Set(value as string[])];
}
export async function validateAlbumIds(value: unknown): Promise<string[]> {
  const ids = idsInput(value);
  for (const id of ids) if (!await dbGet('SELECT id FROM albums WHERE id = ?', [id])) throw new AlbumInputError('画册不存在或已删除');
  return ids;
}
export async function setPhotoAlbums(photoId: string, value: unknown, beforeIds?: unknown) {
  const ids = await validateAlbumIds(value);
  const anchors = beforeIds === undefined ? [] : idsInput(beforeIds);
  const existing = await dbAll<{ album_id: string }>('SELECT album_id FROM album_photos WHERE photo_id = ?', [photoId]);
  for (const row of existing) if (!ids.includes(row.album_id)) {
    await dbRun('DELETE FROM album_photos WHERE album_id = ? AND photo_id = ?', [row.album_id, photoId]);
    await dbRun('UPDATE albums SET cover_photo_id = NULL WHERE id = ? AND cover_photo_id = ?', [row.album_id, photoId]);
  }
  for (const id of ids) {
    if (await dbGet('SELECT 1 FROM album_photos WHERE album_id = ? AND photo_id = ?', [id, photoId])) continue;
    const members = await dbAll<{ photo_id: string; position: number }>('SELECT photo_id, position FROM album_photos WHERE album_id = ? ORDER BY position, photo_id', [id]);
    const anchor = members.find(member => anchors.includes(member.photo_id));
    const position = anchor?.position ?? ((members.at(-1)?.position ?? -1) + 1);
    if (anchor) await dbRun('UPDATE album_photos SET position = position + 1 WHERE album_id = ? AND position >= ?', [id, position]);
    await dbRun('INSERT INTO album_photos(album_id, photo_id, position) VALUES (?, ?, ?)', [id, photoId, position]);
  }
}
export class AlbumDao {
  async list(admin = false) {
    const rows = await dbAll<AlbumRow>(`SELECT * FROM albums ${admin ? '' : 'WHERE published = 1 AND EXISTS (SELECT 1 FROM album_photos WHERE album_id = albums.id)'} ORDER BY position, created_at DESC, id`);
    if (!rows.length) return [];
    const memberRows = await dbAll<{ album_id: string; photo_id: string }>(
      `SELECT album_id, photo_id FROM album_photos
       WHERE album_id IN (${rows.map(() => '?').join(', ')})
       ORDER BY album_id, position, photo_id`,
      rows.map(row => row.id),
    );
    const membersByAlbum = new Map<string, string[]>();
    memberRows.forEach(({ album_id, photo_id }) => membersByAlbum.set(album_id, [...(membersByAlbum.get(album_id) || []), photo_id]));
    const previewIds = rows.flatMap(row => {
      const ids = membersByAlbum.get(row.id) || [];
      const cover = ids.includes(row.cover_photo_id || '') ? row.cover_photo_id : ids[0] || null;
      return [cover, ...ids.filter(id => id !== cover)].filter((id): id is string => Boolean(id)).slice(0, 3);
    });
    const previewPhotos = await new PhotoDao().getPhotosWithTagsByIds([...new Set(previewIds)]);
    const photoById = new Map(previewPhotos.map(photo => [photo.id, photo]));
    return rows.map(row => {
      const ids = membersByAlbum.get(row.id) || [];
      const cover = ids.includes(row.cover_photo_id || '') ? row.cover_photo_id : ids[0] || null;
      const previews = [cover, ...ids.filter(id => id !== cover)].filter((id): id is string => Boolean(id)).slice(0, 3);
      return { id: row.id, name: row.name, description: row.description, published: Boolean(row.published), coverPhotoId: cover, position: row.position, photoCount: ids.length,
        previews: previews.flatMap(id => photoById.get(id) || []) };
    });
  }
  async detail(id: string, admin = false) {
    const row = await dbGet<AlbumRow>('SELECT * FROM albums WHERE id = ?', [id]);
    if (!row || (!admin && !row.published)) return null;
    const members = await dbAll<{ photo_id: string }>('SELECT photo_id FROM album_photos WHERE album_id = ? ORDER BY position, photo_id', [id]);
    const photos = await new PhotoDao().getPhotosWithTagsByIds(members.map(member => member.photo_id));
    if (!admin && !photos.length) return null;
    return { id: row.id, name: row.name, description: row.description, published: Boolean(row.published), coverPhotoId: members.some(m => m.photo_id === row.cover_photo_id) ? row.cover_photo_id : null,
      photos };
  }
  async save(id: string | null, input: Record<string, unknown>) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200) throw new AlbumInputError('名称为必填项，最多 200 字');
    if (input.description !== undefined && (typeof input.description !== 'string' || input.description.length > 5000)) throw new AlbumInputError('简介最多 5000 字');
    if (typeof input.published !== 'boolean') throw new AlbumInputError('发布状态无效');
    const photoIds = idsInput(input.photoIds);
    if (input.coverPhotoId != null && !photoIds.includes(input.coverPhotoId as string)) throw new AlbumInputError('封面必须是画册内的照片');
    return withTransaction(async () => {
      const existing = id ? await dbGet<AlbumRow>('SELECT * FROM albums WHERE id = ?', [id]) : undefined;
      if (id && !existing) throw new AlbumInputError('画册不存在或已删除');
      if (input.published && !photoIds.length && !existing?.published) throw new AlbumInputError('空画册不能发布，请先添加照片');
      for (const photoId of photoIds) if (!await dbGet('SELECT id FROM photos WHERE id = ?', [photoId])) throw new AlbumInputError('部分照片不存在或已删除，请重新选片');
      const nextId = id || randomUUID();
      if (!id) await dbRun('INSERT INTO albums(id, name, position) VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM albums))', [nextId, input.name]);
      await dbRun("UPDATE albums SET name = ?, description = ?, published = ?, cover_photo_id = ?, updated_at = datetime('now') WHERE id = ?", [(input.name as string).trim(), input.description || '', input.published ? 1 : 0, input.coverPhotoId || null, nextId]);
      await dbRun('DELETE FROM album_photos WHERE album_id = ?', [nextId]);
      for (const [position, photoId] of photoIds.entries()) await dbRun('INSERT INTO album_photos(album_id, photo_id, position) VALUES (?, ?, ?)', [nextId, photoId, position]);
      return this.detail(nextId, true);
    });
  }
  async reorder(value: unknown) {
    const ids = idsInput(value);
    await withTransaction(async () => {
      const rows = await dbAll<{ id: string }>('SELECT id FROM albums');
      if (rows.length !== ids.length || rows.some(row => !ids.includes(row.id))) throw new AlbumInputError('画册列表已变化，请刷新后排序');
      for (const [position, id] of ids.entries()) await dbRun('UPDATE albums SET position = ? WHERE id = ?', [position, id]);
    });
  }
  async addPhotos(albumIds: unknown, photoIds: unknown) {
    return withTransaction(async () => {
      const albums = await validateAlbumIds(albumIds);
      const photos = idsInput(photoIds);
      if (!albums.length || !photos.length) throw new AlbumInputError('请选择画册和照片');
      for (const id of photos) {
        if (!await dbGet('SELECT id FROM photos WHERE id = ?', [id])) throw new AlbumInputError('部分照片不存在或已删除');
        for (const album of albums) await dbRun('INSERT OR IGNORE INTO album_photos(album_id, photo_id, position) VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM album_photos WHERE album_id = ?))', [album, id, album]);
      }
    });
  }
  async delete(id: string) { return (await dbRun('DELETE FROM albums WHERE id = ?', [id])).changes; }
}
