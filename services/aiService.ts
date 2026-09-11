import { apiFetch } from './config';

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
};
