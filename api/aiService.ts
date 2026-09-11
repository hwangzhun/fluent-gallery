import { apiFetch } from './config';

export interface AiPhotoMetadata {
  title: string;
  tags: string[];
}

export const aiService = {
  async suggestTags(file: File): Promise<string[]> {
    const body = new FormData();
    body.append('file', file);
    const response = await apiFetch('/ai/tags', { method: 'POST', body });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'AI 自动打标签失败');
    return result.data.tags;
  },

  async suggestTagsForPhoto(photoId: string): Promise<string[]> {
    const response = await apiFetch('/ai/tags/photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'AI 自动打标签失败');
    return result.data.tags;
  },

  async suggestMetadata(file: File): Promise<AiPhotoMetadata> {
    const body = new FormData();
    body.append('file', file);
    const response = await apiFetch('/ai/metadata', { method: 'POST', body });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'AI 照片信息生成失败');
    return result.data;
  },

  async suggestMetadataForPhoto(photoId: string): Promise<AiPhotoMetadata> {
    const response = await apiFetch('/ai/metadata/photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'AI 照片信息生成失败');
    return result.data;
  },
};
