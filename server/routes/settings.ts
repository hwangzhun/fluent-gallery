import express from 'express';
import { changeAdminPassword, ensureAuthSchema, requireAdmin } from '../auth';
import { dbGet, dbRun } from '../../database/db';
import { getDefaultLocalStorageConfig, loadStorageConfig } from '../storage/config';
import { getOSSClient, normalizePublicUrl, normalizeUploadDir, validateTencentPublicUrl } from '../storage/oss';
import type { OSSConfig } from '../storage/config';

const router = express.Router();

const DEFAULT_SEO = {
  title: 'Fluent Gallery | Hwangzhun 摄影作品集',
  description: 'Fluent Gallery 是 Hwangzhun 的个人摄影画廊，记录光影、城市、自然与日常片刻。',
  keywords: 'Fluent Gallery, Hwangzhun, 摄影, 摄影作品集, 个人画廊, 光影, 城市摄影',
  author: 'Hwangzhun', canonicalUrl: '', ogTitle: '', ogDescription: '', ogImage: '',
};
const DEFAULT_AI = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' };

async function readStored<T extends object>(key: string, fallback: T): Promise<T> {
  await ensureSettingsSchema();
  const row = await dbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  try { return { ...fallback, ...(row ? JSON.parse(row.value) : {}) }; } catch { return fallback; }
}

export async function ensureSettingsSchema() {
  await dbRun(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

router.get('/admin', requireAdmin, async (_request, response) => {
  await ensureAuthSchema();
  response.json({ success: true, data: { hasPassword: true } });
});

router.put('/admin/password', requireAdmin, async (request, response) => {
  const { currentPassword, newPassword } = request.body as { currentPassword?: string; newPassword?: string };
  if (!newPassword || newPassword.length < 6) return response.status(400).json({ success: false, error: '新密码长度至少为6位' });
  try {
    await changeAdminPassword(currentPassword || '', newPassword, (request as express.Request & { adminSessionId?: string }).adminSessionId);
    response.json({ success: true, message: '密码更新成功' });
  } catch (error: any) {
    response.status(error.message === '当前密码错误' ? 401 : 500).json({ success: false, error: error.message || '更新密码失败' });
  }
});

router.get('/storage', requireAdmin, async (_request, response) => {
  try {
    await ensureSettingsSchema();
    const config = await loadStorageConfig();
    const oss = config.oss;
    const defaultLocal = getDefaultLocalStorageConfig();
    response.json({ success: true, data: {
      mode: config.mode,
      local: config.local || defaultLocal,
      oss: {
        provider: oss?.provider || 'aliyun', uploadDir: oss?.uploadDir || 'fluent_gallery', region: oss?.region || '', bucket: oss?.bucket || '',
        cloudImageProcessing: oss?.cloudImageProcessing === true, publicUrl: normalizePublicUrl(oss?.publicUrl),
        endpoint: oss?.endpoint || '', roleArn: oss?.roleArn || '', roleSessionName: oss?.roleSessionName || 'fluent-gallery-session',
        hasAccessKeyId: Boolean(oss?.accessKeyId), hasAccessKeySecret: Boolean(oss?.accessKeySecret),
      },
    }});
  } catch (error: any) {
    response.status(500).json({ success: false, error: '获取存储配置失败', message: error.message });
  }
});

router.put('/storage', requireAdmin, async (request, response) => {
  try {
    const { mode, local, oss } = request.body;
    const existing = await loadStorageConfig();
    const defaultLocal = getDefaultLocalStorageConfig();
    const uploadDir = normalizeUploadDir(typeof oss?.uploadDir === 'string' ? oss.uploadDir : existing.oss?.uploadDir);
    if (uploadDir.split('/').some(segment => segment === '.' || segment === '..') || !/^[\w./-]+$/.test(uploadDir)) {
      return response.status(400).json({ success: false, error: '对象存储上传目录只能包含字母、数字、下划线、短横线、点和斜杠' });
    }
    const mergedOss = {
      provider: oss?.provider || existing.oss?.provider || 'aliyun', uploadDir, region: oss?.region || existing.oss?.region || '',
      cloudImageProcessing: typeof oss?.cloudImageProcessing === 'boolean' ? oss.cloudImageProcessing : existing.oss?.cloudImageProcessing === true,
      publicUrl: normalizePublicUrl(oss?.publicUrl ?? existing.oss?.publicUrl ?? ''),
      accessKeyId: oss?.accessKeyId || existing.oss?.accessKeyId || '', accessKeySecret: oss?.accessKeySecret || existing.oss?.accessKeySecret || '',
      bucket: oss?.bucket || existing.oss?.bucket || '', endpoint: oss?.endpoint ?? existing.oss?.endpoint ?? '',
      roleArn: oss?.roleArn ?? existing.oss?.roleArn ?? '', roleSessionName: oss?.roleSessionName || existing.oss?.roleSessionName || 'fluent-gallery-session',
    };
    const mergedLocal = {
      uploadDir: local?.uploadDir || existing.local?.uploadDir || defaultLocal.uploadDir,
      publicUrl: local?.publicUrl || existing.local?.publicUrl || defaultLocal.publicUrl,
    };
    if (!['local', 'oss'].includes(mode)) return response.status(400).json({ success: false, error: '无效的存储模式' });
    if (mode === 'oss' && (!mergedOss.region || !mergedOss.accessKeyId || !mergedOss.accessKeySecret || !mergedOss.bucket)) return response.status(400).json({ success: false, error: 'OSS配置不完整，请填写区域、密钥和 Bucket' });
    if (mode === 'oss' && mergedOss.provider !== 'tencent' && mergedOss.cloudImageProcessing) {
      return response.status(400).json({ success: false, error: '云端图片处理目前仅支持腾讯云 COS' });
    }
    if (mode === 'oss' && mergedOss.provider === 'tencent' && mergedOss.publicUrl) {
      await validateTencentPublicUrl(await getOSSClient(mergedOss as OSSConfig), mergedOss as OSSConfig);
    }
    await ensureSettingsSchema();
    await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('storage_config', ?, datetime('now'))", [JSON.stringify({ mode, local: mode === 'local' ? mergedLocal : undefined, oss: mode === 'oss' ? mergedOss : undefined })]);
    response.json({ success: true, message: '配置已保存到数据库（需要重启服务器生效）' });
  } catch (error: any) {
    const inputError = /域名|HTTPS|Bucket|COS/.test(error.message || '');
    response.status(inputError ? 400 : 500).json({ success: false, error: inputError ? error.message : '保存存储设置失败', message: error.message });
  }
});

router.get('/gallery', async (_request, response) => {
  await ensureSettingsSchema();
  const [randomizeRow, heroPhotoRow, heroFitRow] = await Promise.all([
    dbGet<{ value: string }>("SELECT value FROM settings WHERE key = 'gallery_randomize_photos'"),
    dbGet<{ value: string }>("SELECT value FROM settings WHERE key = 'gallery_hero_photo_id'"),
    dbGet<{ value: string }>("SELECT value FROM settings WHERE key = 'gallery_hero_image_fit'"),
  ]);
  const configuredHeroId = heroPhotoRow?.value || '';
  const heroPhoto = configuredHeroId ? await dbGet<{ id: string }>('SELECT id FROM photos WHERE id = ?', [configuredHeroId]) : undefined;
  response.json({ success: true, data: {
    randomizePhotos: randomizeRow?.value === 'true',
    heroPhotoId: heroPhoto?.id || null,
    heroImageFit: heroFitRow?.value === 'cover' ? 'cover' : 'contain',
  } });
});

router.put('/gallery', requireAdmin, async (request, response) => {
  const { randomizePhotos, heroPhotoId, heroImageFit } = request.body;
  if (typeof randomizePhotos !== 'boolean') return response.status(400).json({ success: false, error: 'randomizePhotos 必须是布尔值' });
  if (heroPhotoId !== null && typeof heroPhotoId !== 'string') return response.status(400).json({ success: false, error: 'heroPhotoId 必须是字符串或 null' });
  if (!['contain', 'cover'].includes(heroImageFit)) return response.status(400).json({ success: false, error: 'heroImageFit 仅支持 contain 或 cover' });
  await ensureSettingsSchema();
  await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('gallery_randomize_photos', ?, datetime('now'))", [randomizePhotos ? 'true' : 'false']);
  await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('gallery_hero_photo_id', ?, datetime('now'))", [heroPhotoId?.trim() || '']);
  await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('gallery_hero_image_fit', ?, datetime('now'))", [heroImageFit]);
  response.json({ success: true, message: '图库设置已更新', data: { randomizePhotos, heroPhotoId: heroPhotoId?.trim() || null, heroImageFit } });
});

router.get('/seo', async (_request, response) => {
  response.json({ success: true, data: await readStored('seo_config', DEFAULT_SEO) });
});

router.put('/seo', requireAdmin, async (request, response) => {
  const fields = ['title', 'description', 'keywords', 'author', 'canonicalUrl', 'ogTitle', 'ogDescription', 'ogImage'];
  const value: Record<string, string> = {};
  for (const field of fields) {
    const raw = request.body?.[field];
    if (typeof raw !== 'string') return response.status(400).json({ success: false, error: `${field} 必须是文本` });
    value[field] = raw.trim();
  }
  if (!value.title || !value.description) return response.status(400).json({ success: false, error: '页面标题和描述不能为空' });
  await ensureSettingsSchema();
  await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('seo_config', ?, datetime('now'))", [JSON.stringify(value)]);
  response.json({ success: true, data: value, message: 'SEO 设置已保存' });
});

router.get('/ai', requireAdmin, async (_request, response) => {
  const stored = await readStored<{ baseUrl: string; model: string; apiKey?: string }>('ai_config', DEFAULT_AI);
  response.json({ success: true, data: { baseUrl: stored.baseUrl, model: stored.model, hasApiKey: Boolean(stored.apiKey) } });
});

router.put('/ai', requireAdmin, async (request, response) => {
  const baseUrl = typeof request.body?.baseUrl === 'string' ? request.body.baseUrl.trim().replace(/\/$/, '') : '';
  const model = typeof request.body?.model === 'string' ? request.body.model.trim() : '';
  const apiKey = typeof request.body?.apiKey === 'string' ? request.body.apiKey.trim() : '';
  if (!/^https?:\/\//.test(baseUrl) || !model) return response.status(400).json({ success: false, error: '请填写有效的 Base URL 和模型名' });
  const existing = await readStored<{ baseUrl: string; model: string; apiKey?: string }>('ai_config', DEFAULT_AI);
  const saved = { baseUrl, model, apiKey: apiKey || existing.apiKey || '' };
  await ensureSettingsSchema();
  await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ai_config', ?, datetime('now'))", [JSON.stringify(saved)]);
  response.json({ success: true, data: { baseUrl, model, hasApiKey: Boolean(saved.apiKey) }, message: 'API 设置已保存' });
});

export default router;
