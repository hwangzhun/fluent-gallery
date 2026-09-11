import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const directory = mkdtempSync(join(tmpdir(), 'fluent-gallery-settings-'));
process.env.GALLERY_DB_PATH = join(directory, 'gallery.db');
const { initDatabase, closeDatabase, dbRun } = await import('../database/db');
const { default: authRouter } = await import('./auth');
const { default: settingsRouter } = await import('./routes/settings');
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
  it('exposes fluent_gallery as the default OSS upload directory', async () => {
    const response = await agent.get('/api/settings/storage').expect(200);
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
