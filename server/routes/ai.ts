import express from 'express';
import multer from 'multer';
import { dbGet } from '../../database/db';
import { TagDao } from '../../database/dao/tagDao';
import { PhotoDao } from '../../database/dao/photoDao';
import { requireAdmin } from '../auth';
import { prepareImageForVision } from '../imageProcessing';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const defaults = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' };

class AiGatewayError extends Error {
  constructor(message: string, readonly status: number = 502) { super(message); }
}

class AiTagValidationError extends Error {}

async function config(): Promise<{ baseUrl: string; model: string; apiKey?: string }> {
  const row = await dbGet<{ value: string }>("SELECT value FROM settings WHERE key = 'ai_config'");
  try { return { ...defaults, ...(row ? JSON.parse(row.value) : {}) } as { baseUrl: string; model: string; apiKey?: string }; }
  catch { return defaults as { baseUrl: string; model: string; apiKey?: string }; }
}

export function parseTags(content: string, available: string[]) {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new AiTagValidationError('AI 未返回可用的标签 JSON');
  let parsed: { tags?: unknown };
  try {
    parsed = JSON.parse(match[0]) as { tags?: unknown };
  } catch {
    throw new AiTagValidationError('AI 返回的标签 JSON 无效');
  }
  if (!Array.isArray(parsed.tags)) throw new AiTagValidationError('AI 返回格式无效');
  const normalized = parsed.tags.map(tag => typeof tag === 'string' ? tag.trim() : '').filter(Boolean);
  const exact = new Map(available.map(tag => [tag.toLocaleLowerCase(), tag]));
  const result = [...new Set(normalized.map(tag => exact.get(tag.toLocaleLowerCase()) || tag))];
  const created = result.filter(tag => !exact.has(tag.toLocaleLowerCase()));
  const requiredExisting = Math.min(2, new Set([...exact.keys()]).size);
  if (result.length !== 3 || created.length > 3 - requiredExisting) throw new AiTagValidationError('AI 标签不符合三项且优先复用已有标签的要求');
  return result;
}

async function requestTags(image: Buffer, settings: { baseUrl: string; model: string; apiKey?: string }, tags: string[]) {
  const requiredExisting = Math.min(2, tags.length);
  const reuseRule = requiredExisting === 0
    ? '目前没有已有标签，请生成 3 个简洁、具体的中文标签。'
    : `输出的 3 个标签中至少 ${requiredExisting} 个必须逐字从已有标签中选择；最多可新增 ${3 - requiredExisting} 个标签。`;
  const prompt = `分析这张摄影作品，返回最贴切的 3 个中文标签。${reuseRule} 不要解释、不要使用 Markdown，只返回 JSON：{"tags":["标签一","标签二","标签三"]}。已有标签：${tags.join('、') || '（暂无）'}`;
  let response: Response;
  try {
    response = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
      // DeepSeek enables reasoning by default. Tagging is a constrained extraction task,
      // so disable it; otherwise a small output budget can be consumed before the JSON reply.
      body: JSON.stringify({ model: settings.model, thinking: { type: 'disabled' }, max_tokens: 256, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image.toString('base64')}`, detail: 'low' } }] }] }),
    });
  } catch (error) {
    throw new AiGatewayError(`无法连接 AI 服务：${error instanceof Error ? error.message : '网络请求失败'}`);
  }
  const result = await response.json().catch(() => null) as any;
  if (!response.ok) throw new AiGatewayError(`AI 服务返回 ${response.status}：${result?.error?.message || result?.message || '请求失败'}`, response.status);
  return String(result?.choices?.[0]?.message?.content || '');
}

async function generateTags(file: Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'originalname'>) {
  const settings = await config();
  if (!settings.apiKey) throw new AiGatewayError('请先在 API 设置中保存 API Key', 400);
  const image = await prepareImageForVision(file);
  const tags = await new TagDao().getAllTagNames();
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return parseTags(await requestTags(image, settings, tags), tags); }
    catch (error) {
      if (!(error instanceof AiTagValidationError)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

async function getStoredPhotoFile(photoId: string): Promise<Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'originalname'>> {
  const photo = await new PhotoDao().getPhotoById(photoId);
  if (!photo) throw new AiGatewayError('照片不存在', 404);
  let source: Response;
  try {
    source = await fetch(photo.url);
  } catch {
    throw new AiGatewayError('无法读取该照片的原始文件', 422);
  }
  if (!source.ok) throw new AiGatewayError('无法读取该照片的原始文件', 422);
  const buffer = Buffer.from(await source.arrayBuffer());
  if (buffer.length === 0 || buffer.length > 50 * 1024 * 1024) throw new AiGatewayError('照片文件无效或超过 50 MB 限制', 422);
  return {
    buffer,
    mimetype: source.headers.get('content-type')?.split(';')[0] || 'image/jpeg',
    originalname: 'stored-photo.jpg',
  };
}

router.post('/tags', requireAdmin, upload.single('file'), async (request, response) => {
  try {
    if (!request.file) return response.status(400).json({ success: false, error: '请选择一张图片' });
    return response.json({ success: true, data: { tags: await generateTags(request.file) } });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'AI 自动打标签失败';
    console.error('AI 自动打标签失败:', error);
    const status = error instanceof AiTagValidationError
      ? 422
      : error instanceof AiGatewayError && error.status >= 400 && error.status < 500
        ? error.status
        : 502;
    response.status(status).json({ success: false, error: message });
  }
});

router.post('/tags/photo', requireAdmin, async (request, response) => {
  try {
    const photoId = typeof request.body?.photoId === 'string' ? request.body.photoId.trim() : '';
    if (!photoId) return response.status(400).json({ success: false, error: '照片 ID 无效' });
    return response.json({ success: true, data: { tags: await generateTags(await getStoredPhotoFile(photoId)) } });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'AI 自动打标签失败';
    console.error('AI 自动打标签失败:', error);
    const status = error instanceof AiTagValidationError
      ? 422
      : error instanceof AiGatewayError && error.status >= 400 && error.status < 500
        ? error.status
        : 502;
    response.status(status).json({ success: false, error: message });
  }
});

export default router;
