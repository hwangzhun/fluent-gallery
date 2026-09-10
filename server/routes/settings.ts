import express from 'express';
import { changeAdminPassword, ensureAuthSchema, requireAdmin } from '../auth';
import { dbGet, dbRun } from '../../database/db';
import { loadStorageConfig } from '../storage/config';

const router = express.Router();

async function ensureSettingsSchema() {
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
    response.json({ success: true, data: {
      mode: config.mode,
      local: config.local || { uploadDir: './uploads', publicUrl: 'http://localhost:3001/uploads' },
      oss: {
        provider: oss?.provider || 'aliyun', region: oss?.region || '', bucket: oss?.bucket || '',
        endpoint: oss?.endpoint || '', roleArn: oss?.roleArn || '', roleSessionName: oss?.roleSessionName || 'fluent-gallery-session',
        hasAccessKeyId: Boolean(oss?.accessKeyId), hasAccessKeySecret: Boolean(oss?.accessKeySecret),
      },
      server: { port: process.env.PORT || '3001' },
      frontend: { apiBaseUrl: process.env.VITE_API_BASE_URL || 'http://localhost:3001/api' },
    }});
  } catch (error: any) {
    response.status(500).json({ success: false, error: '获取存储配置失败', message: error.message });
  }
});

router.put('/storage', requireAdmin, async (request, response) => {
  try {
    const { mode, local, oss, server, frontend } = request.body;
    const existing = await loadStorageConfig();
    const mergedOss = {
      provider: oss?.provider || existing.oss?.provider || 'aliyun', region: oss?.region || existing.oss?.region || '',
      accessKeyId: oss?.accessKeyId || existing.oss?.accessKeyId || '', accessKeySecret: oss?.accessKeySecret || existing.oss?.accessKeySecret || '',
      bucket: oss?.bucket || existing.oss?.bucket || '', endpoint: oss?.endpoint ?? existing.oss?.endpoint ?? '',
      roleArn: oss?.roleArn ?? existing.oss?.roleArn ?? '', roleSessionName: oss?.roleSessionName || existing.oss?.roleSessionName || 'fluent-gallery-session',
    };
    const mergedLocal = { uploadDir: local?.uploadDir || existing.local?.uploadDir || './uploads', publicUrl: local?.publicUrl || existing.local?.publicUrl || 'http://localhost:3001/uploads' };
    if (!['local', 'oss'].includes(mode)) return response.status(400).json({ success: false, error: '无效的存储模式' });
    if (mode === 'oss' && (!mergedOss.region || !mergedOss.accessKeyId || !mergedOss.accessKeySecret || !mergedOss.bucket)) return response.status(400).json({ success: false, error: 'OSS配置不完整，请填写区域、密钥和 Bucket' });
    await ensureSettingsSchema();
    await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('storage_config', ?, datetime('now'))", [JSON.stringify({ mode, local: mode === 'local' ? mergedLocal : undefined, oss: mode === 'oss' ? mergedOss : undefined, server, frontend })]);
    response.json({ success: true, message: '配置已保存到数据库（需要重启服务器生效）' });
  } catch (error: any) {
    response.status(500).json({ success: false, error: '保存存储设置失败', message: error.message });
  }
});

router.get('/gallery', async (_request, response) => {
  await ensureSettingsSchema();
  const [randomizeRow, heroPhotoRow, heroFitRow] = await Promise.all([
    dbGet<{ value: string }>("SELECT value FROM settings WHERE key = 'gallery_randomize_photos'"),
    dbGet<{ value: string }>("SELECT value FROM settings WHERE key = 'gallery_hero_photo_id'"),
    dbGet<{ value: string }>("SELECT value FROM settings WHERE key = 'gallery_hero_image_fit'"),
  ]);
  response.json({ success: true, data: {
    randomizePhotos: randomizeRow?.value === 'true',
    heroPhotoId: heroPhotoRow?.value || null,
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

export default router;
