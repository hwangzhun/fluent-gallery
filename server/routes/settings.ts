import { getHeroImages, isHeroAspectRatio, isHeroImageSettings, type HeroImageSettings, type LegacyHeroSettings } from '../../shared/hero';
import express from 'express';
import { changeAdminPassword, ensureAuthSchema, requireAdmin } from '../auth';
import { dbAll, dbGet, dbRun, withTransaction } from '../../database/db';
import { getDefaultLocalStorageConfig, loadStorageConfig } from '../storage/config';
import { getOSSClient, normalizePublicUrl, normalizeUploadDir, validateTencentPublicUrl } from '../storage/oss';
import type { OSSConfig } from '../storage/config';

const router = express.Router();

const DEFAULT_SEO = {
  title: 'Fluent Gallery | 摄影作品集',
  description: 'Fluent Gallery 是一个记录光影、城市、自然与日常片刻的摄影画廊。',
  keywords: 'Fluent Gallery, 摄影, 摄影作品集, 在线画廊, 光影, 城市摄影',
  author: 'Fluent Gallery', canonicalUrl: '', ogTitle: '', ogDescription: '', ogImage: '',
};
const DEFAULT_AI = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' };
const DEFAULT_ANALYTICS = { enabled: false, measurementId: '' };
const GA_MEASUREMENT_ID = /^G-[A-Z0-9]+$/i;

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

function parseHeroPosition(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : 50;
}

async function existingHeroIds(images: HeroImageSettings[]): Promise<Set<string>> {
  if (!images.length) return new Set();
  const rows = await dbAll<{ id: string }>(`SELECT id FROM photos WHERE id IN (${images.map(() => '?').join(',')})`, images.map(image => image.photoId));
  return new Set(rows.map(photo => photo.id));
}

router.get('/gallery', async (_request, response) => {
  await ensureSettingsSchema();
  const [randomizeRow, heroPhotoRow, heroFitRow, heroAspectRow, heroPositionXRow, heroPositionYRow, heroScaleRow, heroPositionPhotoRow] = await Promise.all([
    dbGet<{ value: string }>("SELECT value FROM settings WHERE key = 'gallery_randomize_photos'"),
    dbGet<{ value: string }>("SELECT value FROM settings WHERE key = 'gallery_hero_photo_id'"),
    dbGet<{ value: string }>("SELECT value FROM settings WHERE key = 'gallery_hero_image_fit'"),
    dbGet<{ value: string }>("SELECT value FROM settings WHERE key = 'gallery_hero_aspect_ratio'"),
    dbGet<{ value: string }>("SELECT value FROM settings WHERE key = 'gallery_hero_image_position_x'"),
    dbGet<{ value: string }>("SELECT value FROM settings WHERE key = 'gallery_hero_image_position_y'"),
    dbGet<{ value: string }>("SELECT value FROM settings WHERE key = 'gallery_hero_image_scale'"),
    dbGet<{ value: string }>("SELECT value FROM settings WHERE key = 'gallery_hero_image_position_photo_id'"),
  ]);
  const configuredHeroId = heroPhotoRow?.value || '';
  const heroPhoto = configuredHeroId ? await dbGet<{ id: string }>('SELECT id FROM photos WHERE id = ?', [configuredHeroId]) : undefined;
  const data = {
    randomizePhotos: randomizeRow?.value === 'true',
    heroPhotoId: heroPhoto?.id || null,
    heroImageFit: (heroFitRow?.value === 'cover' ? 'cover' : 'contain') as LegacyHeroSettings['heroImageFit'],
    heroAspectRatio: isHeroAspectRatio(heroAspectRow?.value) ? heroAspectRow.value : '4:3' as const,
    heroImagePositionX: parseHeroPosition(heroPositionXRow?.value),
    heroImagePositionY: parseHeroPosition(heroPositionYRow?.value),
    heroImageScale: (() => { const value = Number(heroScaleRow?.value); return Number.isFinite(value) && value >= 1 && value <= 3 ? value : 1; })(),
    heroImagePositionPhotoId: heroPositionPhotoRow?.value || null,
  };
  const imagesRow = await dbGet<{ value: string }>("SELECT value FROM settings WHERE key = 'gallery_hero_images'");
  let images = getHeroImages(data);
  if (imagesRow) {
    try { const parsed = JSON.parse(imagesRow.value); images = Array.isArray(parsed) ? parsed.filter(isHeroImageSettings) : images; } catch { /* Retain the legacy configuration if storage is malformed. */ }
  }
  const ids = await existingHeroIds(images);
  response.json({ success: true, data: { ...data, heroImages: images.filter(image => ids.has(image.photoId)) } });
});

router.put('/gallery', requireAdmin, async (request, response) => {
  if (request.body.heroImages !== undefined) {
    const { heroImages, randomizePhotos } = request.body;
    if (typeof randomizePhotos !== 'boolean' || !Array.isArray(heroImages) || !heroImages.every(isHeroImageSettings)
      || new Set(heroImages.map((image: HeroImageSettings) => image.photoId)).size !== heroImages.length) {
      return response.status(400).json({ success: false, error: 'Hero 设置无效：请选择不同照片、有效比例、0–100 的位置和 1–3 的缩放' });
    }
    const fallback = request.body;
    if ((!heroImages.length && fallback.heroImageFit !== undefined && !['contain', 'cover'].includes(fallback.heroImageFit))
      || (!heroImages.length && fallback.heroAspectRatio !== undefined && !isHeroAspectRatio(fallback.heroAspectRatio))) {
      return response.status(400).json({ success: false, error: '自动选择的展示方式或比例无效' });
    }
    const autoView = { photoId: fallback.heroImagePositionPhotoId || 'automatic', fit: fallback.heroImageFit || 'contain', aspectRatio: fallback.heroAspectRatio || '4:3',
      positionX: fallback.heroImagePositionX ?? 50, positionY: fallback.heroImagePositionY ?? 50, scale: fallback.heroImageScale ?? 1 };
    if (!heroImages.length && !isHeroImageSettings(autoView)) return response.status(400).json({ success: false, error: '自动选择的构图无效' });
    try {
      await ensureSettingsSchema();
      await withTransaction(async () => {
        const ids = await existingHeroIds(heroImages);
        if (heroImages.some((image: HeroImageSettings) => !ids.has(image.photoId))) throw new Error('所选 Hero 照片已不存在，请重新选择');
        await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('gallery_hero_images', ?, datetime('now'))", [JSON.stringify(heroImages)]);
        await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('gallery_randomize_photos', ?, datetime('now'))", [String(randomizePhotos)]);
        // Keep legacy readers on the first selected artwork; clearing the array clears the old selection too.
        const first = heroImages[0] as HeroImageSettings | undefined;
        const legacy = {
          gallery_hero_photo_id: first?.photoId || '', gallery_hero_image_fit: first?.fit || request.body.heroImageFit || 'contain',
          gallery_hero_aspect_ratio: first?.aspectRatio || (isHeroAspectRatio(request.body.heroAspectRatio) ? request.body.heroAspectRatio : '4:3'),
          gallery_hero_image_position_x: String(first?.positionX ?? autoView.positionX), gallery_hero_image_position_y: String(first?.positionY ?? autoView.positionY),
          gallery_hero_image_scale: String(first?.scale ?? autoView.scale), gallery_hero_image_position_photo_id: first?.photoId || fallback.heroImagePositionPhotoId || '',
        };
        for (const [key, value] of Object.entries(legacy)) await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))", [key, value]);
      });
      return response.json({ success: true, data: { randomizePhotos, heroImages }, message: '图库设置已更新' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存图库设置失败';
      return response.status(message.includes('已不存在') ? 400 : 500).json({ success: false, error: message });
    }
  }
  const { randomizePhotos, heroPhotoId, heroImageFit, heroAspectRatio, heroImagePositionX, heroImagePositionY, heroImageScale, heroImagePositionPhotoId } = request.body;
  if (typeof randomizePhotos !== 'boolean') return response.status(400).json({ success: false, error: 'randomizePhotos 必须是布尔值' });
  if (heroPhotoId !== null && typeof heroPhotoId !== 'string') return response.status(400).json({ success: false, error: 'heroPhotoId 必须是字符串或 null' });
  if (!['contain', 'cover'].includes(heroImageFit)) return response.status(400).json({ success: false, error: 'heroImageFit 仅支持 contain 或 cover' });
  if (!isHeroAspectRatio(heroAspectRatio)) return response.status(400).json({ success: false, error: '不支持的 Hero 画幅比例' });
  if (typeof heroImagePositionX !== 'number' || !Number.isFinite(heroImagePositionX) || heroImagePositionX < 0 || heroImagePositionX > 100) return response.status(400).json({ success: false, error: 'heroImagePositionX 必须是 0 到 100 之间的数字' });
  if (typeof heroImagePositionY !== 'number' || !Number.isFinite(heroImagePositionY) || heroImagePositionY < 0 || heroImagePositionY > 100) return response.status(400).json({ success: false, error: 'heroImagePositionY 必须是 0 到 100 之间的数字' });
  if (typeof heroImageScale !== 'number' || !Number.isFinite(heroImageScale) || heroImageScale < 1 || heroImageScale > 3) return response.status(400).json({ success: false, error: 'heroImageScale 必须是 1 到 3 之间的数字' });
  if (heroImagePositionPhotoId !== null && typeof heroImagePositionPhotoId !== 'string') return response.status(400).json({ success: false, error: 'heroImagePositionPhotoId 必须是字符串或 null' });
  await ensureSettingsSchema();
  if (heroPhotoId?.trim() && !await dbGet('SELECT id FROM photos WHERE id = ?', [heroPhotoId.trim()])) {
    return response.status(400).json({ success: false, error: '所选 Hero 照片已不存在，请重新选择' });
  }
  try {
    await withTransaction(async () => {
      await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('gallery_randomize_photos', ?, datetime('now'))", [randomizePhotos ? 'true' : 'false']);
      await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('gallery_hero_photo_id', ?, datetime('now'))", [heroPhotoId?.trim() || '']);
      await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('gallery_hero_image_fit', ?, datetime('now'))", [heroImageFit]);
      await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('gallery_hero_aspect_ratio', ?, datetime('now'))", [heroAspectRatio]);
      await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('gallery_hero_image_position_x', ?, datetime('now'))", [String(heroImagePositionX)]);
      await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('gallery_hero_image_position_y', ?, datetime('now'))", [String(heroImagePositionY)]);
      await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('gallery_hero_image_scale', ?, datetime('now'))", [String(heroImageScale)]);
      await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('gallery_hero_image_position_photo_id', ?, datetime('now'))", [heroImagePositionPhotoId?.trim() || '']);
      await dbRun("DELETE FROM settings WHERE key = 'gallery_hero_images'");
    });
  } catch { return response.status(500).json({ success: false, error: '保存图库设置失败' }); }
  response.json({ success: true, message: '图库设置已更新', data: { randomizePhotos, heroPhotoId: heroPhotoId?.trim() || null, heroImageFit, heroAspectRatio, heroImagePositionX, heroImagePositionY, heroImageScale, heroImagePositionPhotoId: heroImagePositionPhotoId?.trim() || null } });
});

router.get('/author', requireAdmin, async (_request, response) => {
  try { response.json({ success: true, data: await readStored('author_config', { author: '', copyright: '' }) }); }
  catch { response.status(500).json({ success: false, error: '获取作者信息失败' }); }
});

router.put('/author', requireAdmin, async (request, response) => {
  if (typeof request.body?.author !== 'string' || typeof request.body?.copyright !== 'string') {
    return response.status(400).json({ success: false, error: '作者和版权必须是文本' });
  }
  const value = { author: request.body.author.trim(), copyright: request.body.copyright.trim() };
  try {
    await ensureSettingsSchema();
    await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('author_config', ?, datetime('now'))", [JSON.stringify(value)]);
    response.json({ success: true, data: value, message: '作者信息已保存' });
  } catch { response.status(500).json({ success: false, error: '保存作者信息失败' }); }
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

router.get('/analytics', async (_request, response) => {
  const stored = await readStored('analytics_config', DEFAULT_ANALYTICS);
  response.json({ success: true, data: {
    enabled: stored.enabled === true,
    measurementId: typeof stored.measurementId === 'string' ? stored.measurementId : '',
  }});
});

router.put('/analytics', requireAdmin, async (request, response) => {
  const enabled = request.body?.enabled;
  const measurementId = typeof request.body?.measurementId === 'string' ? request.body.measurementId.trim().toUpperCase() : '';
  if (typeof enabled !== 'boolean') return response.status(400).json({ success: false, error: 'enabled 必须是布尔值' });
  if (measurementId && !GA_MEASUREMENT_ID.test(measurementId)) return response.status(400).json({ success: false, error: 'Measurement ID 格式无效，应为 G-XXXXXXXXXX' });
  if (enabled && !measurementId) return response.status(400).json({ success: false, error: '启用数据统计前请填写 Measurement ID' });
  const existing = await readStored('analytics_config', DEFAULT_ANALYTICS);
  const value = { enabled, measurementId: measurementId || existing.measurementId || '' };
  await ensureSettingsSchema();
  await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('analytics_config', ?, datetime('now'))", [JSON.stringify(value)]);
  response.json({ success: true, data: value, message: enabled ? 'GA4 数据统计已启用' : 'GA4 数据统计已停用' });
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
