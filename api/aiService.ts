import { apiFetch } from './config';

export interface AiPhotoMetadata {
  title: string;
  tags: string[];
}

const AI_UPLOAD_MAX_EDGE = 1536;
const AI_UPLOAD_SKIP_BELOW_BYTES = 1024 * 1024;

/**
 * The vision endpoint only needs a compact preview. Sending camera originals
 * through the public HTTP/2 proxy made batch analysis unnecessarily fragile.
 * Formats the browser cannot decode (notably HEIC in some browsers) fall back
 * to the original file so the server-side decoder can still handle them.
 */
async function prepareAiUpload(file: File): Promise<File> {
  if (file.size <= AI_UPLOAD_SKIP_BELOW_BYTES
    || typeof document === 'undefined'
    || typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, AI_UPLOAD_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.84));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '-ai.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

async function imageBody(file: File) {
  const prepared = await prepareAiUpload(file);
  const body = new FormData();
  body.append('file', prepared);
  return body;
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
  async suggestTitle(file: File): Promise<string> {
    const body = await imageBody(file);
    const response = await apiFetch('/ai/title', { method: 'POST', body });
    return (await readAiResult<{ title: string }>(response, 'AI 标题生成失败')).title;
  },

  async suggestTitleForPhoto(photoId: string): Promise<string> {
    const response = await apiFetch('/ai/title/photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId }),
    });
    return (await readAiResult<{ title: string }>(response, 'AI 标题生成失败')).title;
  },

  async suggestTags(file: File): Promise<string[]> {
    const body = await imageBody(file);
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
    const body = await imageBody(file);
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
