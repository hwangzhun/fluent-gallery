import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const directory = mkdtempSync(join(tmpdir(), 'fluent-gallery-settings-'));
process.env.GALLERY_DB_PATH = join(directory, 'gallery.db');
delete process.env.LOCAL_PUBLIC_URL;
const { initDatabase, closeDatabase, dbGet, dbRun } = await import('../database/db');
const { default: authRouter } = await import('./auth');
const { default: settingsRouter } = await import('./routes/settings');
const { loadStorageConfig, migrateLegacyLocalPhotoUrls, resolveLocalUploadDir } = await import('./storage/config');
const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/settings', settingsRouter);
const agent = request.agent(app);

beforeAll(async () => {
  await initDatabase();
  await agent.post('/api/auth/login').send({ password: 'admin123' }).expect(200);
});
afterAll(async () => { await closeDatabase(); rmSync(directory, { recursive: true, force: true }); });

describe('gallery display settings', () => {
  it('exposes safe defaults publicly while protecting updates', async () => {
    const response = await request(app).get('/api/settings/gallery').expect(200);
    expect(response.body.data).toEqual({ randomizePhotos: false, heroPhotoId: null, heroImageFit: 'contain' });
    await request(app).put('/api/settings/gallery').send({ randomizePhotos: true, heroPhotoId: null, heroImageFit: 'cover' }).expect(401);
  });

  it('persists the Hero selection, fit mode, and waterfall randomization switch', async () => {
    await dbRun("INSERT INTO photos (id, url, thumbnail_url, title, year, width, height) VALUES ('photo-hero', '/hero.webp', '/hero-thumb.webp', 'Hero', 2026, 1200, 800)");
    await agent.put('/api/settings/gallery').send({ randomizePhotos: true, heroPhotoId: 'photo-hero', heroImageFit: 'cover' }).expect(200);
    const response = await request(app).get('/api/settings/gallery').expect(200);
    expect(response.body.data).toEqual({ randomizePhotos: true, heroPhotoId: 'photo-hero', heroImageFit: 'cover' });

    await dbRun("DELETE FROM photos WHERE id = 'photo-hero'");
    const staleResponse = await request(app).get('/api/settings/gallery').expect(200);
    expect(staleResponse.body.data.heroPhotoId).toBeNull();
  });

  it('rejects unsupported Hero fit modes', async () => {
    await agent.put('/api/settings/gallery').send({ randomizePhotos: false, heroPhotoId: null, heroImageFit: 'stretch' }).expect(400);
  });
});

describe('object storage settings', () => {
  it('preserves absolute Docker upload paths and resolves relative local paths', () => {
    expect(resolveLocalUploadDir('/app/uploads')).toBe('/app/uploads');
    expect(resolveLocalUploadDir('./uploads')).toBe(join(process.cwd(), 'uploads'));
  });

  it('rebases legacy localhost upload URLs to the active local public URL', async () => {
    await dbRun(`INSERT INTO photos (id, url, thumbnail_url, object_key, thumbnail_object_key, title, year, width, height)
      VALUES ('legacy-local-url', 'http://localhost:3001/uploads/photos/2026/01/image.avif', 'http://127.0.0.1:3001/uploads/thumbs/2026/01/image.avif', 'photos/2026/01/image.avif', 'thumbs/2026/01/image.avif', 'Legacy', 2026, 1200, 800)`);
    await dbRun(`INSERT INTO photos (id, url, thumbnail_url, title, year, width, height)
      VALUES ('external-url', 'https://cdn.example.com/image.avif', 'https://cdn.example.com/thumb.avif', 'External', 2026, 1200, 800)`);

    expect(await migrateLegacyLocalPhotoUrls({ mode: 'local', local: { uploadDir: '/app/uploads', publicUrl: '/uploads' } })).toBe(1);
    expect(await dbGet<{ url: string; thumbnail_url: string }>("SELECT url, thumbnail_url FROM photos WHERE id = 'legacy-local-url'"))
      .toEqual({ url: '/uploads/photos/2026/01/image.avif', thumbnail_url: '/uploads/thumbs/2026/01/image.avif' });
    expect(await dbGet<{ url: string }>("SELECT url FROM photos WHERE id = 'external-url'"))
      .toEqual({ url: 'https://cdn.example.com/image.avif' });
  });

  it('replaces a saved legacy local public URL with the active environment default', async () => {
    await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('storage_config', ?)", [JSON.stringify({ mode: 'local', local: { uploadDir: './uploads', publicUrl: 'http://localhost:3001/uploads' } })]);
    expect((await loadStorageConfig()).local).toEqual({ uploadDir: './uploads', publicUrl: '/uploads' });
  });

  it('exposes fluent_gallery as the default OSS upload directory', async () => {
    const response = await agent.get('/api/settings/storage').expect(200);
    expect(response.body.data.local).toEqual({ uploadDir: './uploads', publicUrl: '/uploads' });
    expect(response.body.data.oss.uploadDir).toBe('fluent_gallery');
    expect(response.body.data.oss.cloudImageProcessing).toBe(false);
    expect(response.body.data.oss.publicUrl).toBe('');
  });

  it('normalizes and persists the OSS upload directory', async () => {
    await agent.put('/api/settings/storage').send({
      mode: 'oss',
      oss: {
        provider: 'aliyun', uploadDir: '/gallery//production/', region: 'oss-cn-hangzhou',
        bucket: 'gallery', accessKeyId: 'test-key', accessKeySecret: 'test-secret',
      },
    }).expect(200);

    const response = await agent.get('/api/settings/storage').expect(200);
    expect(response.body.data.oss.uploadDir).toBe('gallery/production');
  });

  it('rejects parent directory segments', async () => {
    await agent.put('/api/settings/storage').send({
      mode: 'oss',
      oss: { uploadDir: '../gallery', region: 'oss-cn-hangzhou', bucket: 'gallery' },
    }).expect(400);
  });

  it('does not allow Tencent-only cloud processing for Aliyun', async () => {
    const response = await agent.put('/api/settings/storage').send({
      mode: 'oss',
      oss: { provider: 'aliyun', uploadDir: 'gallery', region: 'oss-cn-hangzhou', bucket: 'gallery', cloudImageProcessing: true },
    }).expect(400);
    expect(response.body.error).toContain('仅支持腾讯云');
  });
});
