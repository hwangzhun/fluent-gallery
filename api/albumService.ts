import type { Photo } from '../types';
import type { PhotoWithTags } from '../database/types';
import { apiFetch } from './config';
import { dbPhotoToPhoto } from './utils';
export interface Album {
  id: string; name: string; description: string; published: boolean;
  coverPhotoId: string | null; photoCount: number; position: number; previews: Photo[];
}
export interface AlbumDetail { id: string; name: string; description: string; published: boolean; coverPhotoId: string | null; photos: Photo[]; }
export interface AlbumInput { name: string; description: string; published: boolean; coverPhotoId: string | null; photoIds: string[]; }
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await apiFetch(path, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(response.status === 401 ? '管理员会话已过期，请重新登录' : result.error || '画册操作失败');
  return result.data;
}
export const albumService = {
  async list(admin = false): Promise<Album[]> {
    const rows = await request<Array<Omit<Album, 'previews'> & { previews: PhotoWithTags[] }>>(`/albums${admin ? '/admin' : ''}`);
    return rows.map(row => ({ ...row, previews: row.previews.map(dbPhotoToPhoto) }));
  },
  async detail(id: string, admin = false): Promise<AlbumDetail> {
    const data = await request<Omit<AlbumDetail, 'photos'> & { photos: PhotoWithTags[] }>(`/albums/${admin ? 'admin/' : ''}${encodeURIComponent(id)}`);
    return { ...data, photos: data.photos.map(dbPhotoToPhoto) };
  },
  save: (id: string | null, input: AlbumInput) => request(`/albums${id ? `/${encodeURIComponent(id)}` : ''}`, id ? 'PUT' : 'POST', input),
  remove: (id: string) => request(`/albums/${encodeURIComponent(id)}`, 'DELETE'),
  reorder: (ids: string[]) => request('/albums/order', 'PUT', { ids }),
  addPhotos: (albumIds: string[], photoIds: string[]) => request('/albums/members', 'POST', { albumIds, photoIds }),
};
