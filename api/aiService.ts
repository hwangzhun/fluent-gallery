import { apiFetch } from './config';

export interface AiPhotoMetadata {
  title: string;
  tags: string[];
}

async function readAiResult<T>(response: Response, fallback: string): Promise<T> {
  const result = await response.json().catch(() => null) as { success?: boolean; data?: T; error?: string } | null;
  if (!response.ok || !result?.success || result.data === undefined) {
    const invalidResponse = `AI 服务返回了无效响应（HTTP ${response.status}）`;
    throw new Error(result?.error || (response.ok ? fallback : invalidResponse));
  }
  return result.data;
}

export const aiService = {
  async suggestTags(file: File): Promise<string[]> {
    const body = new FormData();
    body.append('file', file);
    const response = await apiFetch('/ai/tags', { method: 'POST', body });
    return (await readAiResult<{ tags: string[] }>(response, 'AI 自动打标签失败')).tags;
  },

  async suggestTagsForPhoto(photoId: string): Promise<string[]> {
    const response = await apiFetch('/ai/tags/photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId }),
    });
    return (await readAiResult<{ tags: string[] }>(response, 'AI 自动打标签失败')).tags;
  },

  async suggestMetadata(file: File): Promise<AiPhotoMetadata> {
    const body = new FormData();
    body.append('file', file);
    const response = await apiFetch('/ai/metadata', { method: 'POST', body });
    return readAiResult<AiPhotoMetadata>(response, 'AI 照片信息生成失败');
  },

  async suggestMetadataForPhoto(photoId: string): Promise<AiPhotoMetadata> {
    const response = await apiFetch('/ai/metadata/photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId }),
    });
    return readAiResult<AiPhotoMetadata>(response, 'AI 照片信息生成失败');
  },
};
