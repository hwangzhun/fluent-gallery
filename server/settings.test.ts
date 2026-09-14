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
    expect(response.body.data).toEqual({ randomizePhotos: false, heroPhotoId: null, heroImageFit: 'contain', heroAspectRatio: '4:3', heroImagePositionX: 50, heroImagePositionY: 50, heroImageScale: 1, heroImagePositionPhotoId: null, heroImages: [] });
    await request(app).put('/api/settings/gallery').send({ randomizePhotos: true, heroPhotoId: null, heroImageFit: 'cover' }).expect(401);
  });

  it('persists the Hero selection, fit mode, and waterfall randomization switch', async () => {
    await dbRun("INSERT INTO photos (id, url, thumbnail_url, title, year, width, height) VALUES ('photo-hero', '/hero.webp', '/hero-thumb.webp', 'Hero', 2026, 1200, 800)");
    await agent.put('/api/settings/gallery').send({ randomizePhotos: true, heroPhotoId: 'photo-hero', heroImageFit: 'cover', heroAspectRatio: 'xpan', heroImagePositionX: 22.5, heroImagePositionY: 75, heroImageScale: 1.75, heroImagePositionPhotoId: 'photo-hero' }).expect(200);
    const response = await request(app).get('/api/settings/gallery').expect(200);
    expect(response.body.data).toEqual({ randomizePhotos: true, heroPhotoId: 'photo-hero', heroImageFit: 'cover', heroAspectRatio: 'xpan', heroImagePositionX: 22.5, heroImagePositionY: 75, heroImageScale: 1.75, heroImagePositionPhotoId: 'photo-hero', heroImages: [{ photoId: 'photo-hero', fit: 'cover', aspectRatio: 'xpan', positionX: 22.5, positionY: 75, scale: 1.75 }] });

    await dbRun("DELETE FROM photos WHERE id = 'photo-hero'");
    const staleResponse = await request(app).get('/api/settings/gallery').expect(200);
    expect(staleResponse.body.data.heroPhotoId).toBeNull();
  });

  it('rejects unsupported Hero fit modes', async () => {
    await agent.put('/api/settings/gallery').send({ randomizePhotos: false, heroPhotoId: null, heroImageFit: 'stretch' }).expect(400);
  });

  it('rejects Hero positions outside the supported range', async () => {
    await agent.put('/api/settings/gallery').send({ randomizePhotos: false, heroPhotoId: null, heroImageFit: 'cover', heroAspectRatio: '4:3', heroImagePositionX: -1, heroImagePositionY: 50, heroImagePositionPhotoId: null }).expect(400);
    await agent.put('/api/settings/gallery').send({ randomizePhotos: false, heroPhotoId: null, heroImageFit: 'cover', heroAspectRatio: '4:3', heroImagePositionX: 50, heroImagePositionY: 101, heroImagePositionPhotoId: null }).expect(400);
    await agent.put('/api/settings/gallery').send({ randomizePhotos: false, heroPhotoId: null, heroImageFit: 'cover', heroAspectRatio: '4:3', heroImagePositionX: '50', heroImagePositionY: 50, heroImagePositionPhotoId: null }).expect(400);
  });

  it('rejects Hero scale outside the supported range', async () => {
    const settings = { randomizePhotos: false, heroPhotoId: null, heroImageFit: 'cover', heroAspectRatio: '4:3', heroImagePositionX: 50, heroImagePositionY: 50, heroImagePositionPhotoId: null };
    await agent.put('/api/settings/gallery').send({ ...settings, heroImageScale: 0.99 }).expect(400);
    await agent.put('/api/settings/gallery').send({ ...settings, heroImageScale: 3.01 }).expect(400);
  });

  it('rejects unsupported Hero aspect ratios', async () => {
    await agent.put('/api/settings/gallery').send({ randomizePhotos: false, heroPhotoId: null, heroImageFit: 'cover', heroAspectRatio: 'cinemascope' }).expect(400);
  });
});

describe('GA4 analytics settings', () => {
  it('is publicly readable, disabled by default, and protects updates', async () => {
    expect((await request(app).get('/api/settings/analytics').expect(200)).body.data).toEqual({ enabled: false, measurementId: '' });
    await request(app).put('/api/settings/analytics').send({ enabled: true, measurementId: 'G-TEST123' }).expect(401);
  });

  it('validates, normalizes, persists, and retains the ID while disabled', async () => {
    await agent.put('/api/settings/analytics').send({ enabled: true, measurementId: 'UA-123' }).expect(400);
    await agent.put('/api/settings/analytics').send({ enabled: true, measurementId: '' }).expect(400);
    await agent.put('/api/settings/analytics').send({ enabled: true, measurementId: ' g-test123 ' }).expect(200);
    expect((await request(app).get('/api/settings/analytics')).body.data).toEqual({ enabled: true, measurementId: 'G-TEST123' });
    await agent.put('/api/settings/analytics').send({ enabled: false, measurementId: '' }).expect(200);
    expect((await request(app).get('/api/settings/analytics')).body.data).toEqual({ enabled: false, measurementId: 'G-TEST123' });
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

describe('multiple Hero artworks and author defaults', () => {
  const first = { photoId: 'multi-1', fit: 'cover', aspectRatio: '1:1', positionX: 20, positionY: 80, scale: 1.8 };
  const second = { photoId: 'multi-2', fit: 'contain', aspectRatio: '2.35:1', positionX: 50, positionY: 50, scale: 1 };
  it('persists independent crops and accepts every supported ratio', async () => {
    for (const id of ['multi-1', 'multi-2']) await dbRun('INSERT INTO photos (id, url, thumbnail_url, title, year, width, height) VALUES (?, ?, ?, ?, 2026, 1200, 800)', [id, '/test.jpg', '/test.jpg', id]);
    for (const aspectRatio of ['4:3', '1:1', '3:2', '16:9', '2:1', '2.35:1', 'xpan']) {
      const heroImages = [{ ...first, aspectRatio }, second];
      await agent.put('/api/settings/gallery').send({ randomizePhotos: true, heroImages }).expect(200);
      expect((await request(app).get('/api/settings/gallery')).body.data.heroImages).toEqual(heroImages);
    }
  });
  it('rejects invalid arrays without overwriting saved settings', async () => {
    const before = (await request(app).get('/api/settings/gallery')).body.data;
    for (const heroImages of [null, {}, [first, first], [{ ...first, photoId: 'missing' }], [{ ...first, positionX: 101 }], [{ ...first, positionY: '50' }], [{ ...first, scale: 0.9 }], [{ ...first, aspectRatio: 'invalid' }], [{ ...first, fit: 'stretch' }]]) {
      await agent.put('/api/settings/gallery').send({ randomizePhotos: false, heroImages }).expect(400);
    }
    expect((await request(app).get('/api/settings/gallery')).body.data).toEqual(before);
  });
  it('skips deleted candidates and clearing all candidates restores automatic selection', async () => {
    await dbRun("DELETE FROM photos WHERE id = 'multi-1'");
    expect((await request(app).get('/api/settings/gallery')).body.data.heroImages).toEqual([second]);
    await agent.put('/api/settings/gallery').send({ randomizePhotos: false, heroImages: [] }).expect(200);
    expect((await request(app).get('/api/settings/gallery')).body.data).toMatchObject({ heroPhotoId: null, heroImages: [] });
  });
  it('upgrades legacy crops only when they belong to the selected photo', async () => {
    await agent.put('/api/settings/gallery').send({ randomizePhotos: false, heroPhotoId: 'multi-2', heroImageFit: 'cover', heroAspectRatio: '3:2', heroImagePositionX: 10, heroImagePositionY: 90, heroImageScale: 2, heroImagePositionPhotoId: 'other' }).expect(200);
    expect((await request(app).get('/api/settings/gallery')).body.data.heroImages).toEqual([{ ...second, fit: 'cover', aspectRatio: '3:2' }]);
  });
  it('protects both author endpoints and saves only text defaults without changing photos', async () => {
    await request(app).get('/api/settings/author').expect(401);
    await request(app).put('/api/settings/author').send({ author: '作者', copyright: '' }).expect(401);
    const before = await dbGet("SELECT exif FROM photos WHERE id = 'multi-2'");
    await agent.put('/api/settings/author').send({ author: 2, copyright: '' }).expect(400);
    await agent.put('/api/settings/author').send({ author: ' 作者 ', copyright: ' © 测试 ' }).expect(200);
    expect((await agent.get('/api/settings/author')).body.data).toEqual({ author: '作者', copyright: '© 测试' });
    expect(await dbGet("SELECT exif FROM photos WHERE id = 'multi-2'")).toEqual(before);
    await agent.put('/api/settings/author').send({ author: '', copyright: '' }).expect(200);
    expect((await agent.get('/api/settings/author')).body.data).toEqual({ author: '', copyright: '' });
  });
});

describe('SEO settings', () => {
  const customSeo = {
    title: '自定义画廊', description: '自定义描述', keywords: '自定义, 摄影', author: '自定义作者',
    canonicalUrl: 'https://gallery.example.com', ogTitle: '', ogDescription: '', ogImage: '',
  };

  it('returns Fluent Gallery defaults when SEO has not been configured', async () => {
    const response = await request(app).get('/api/settings/seo').expect(200);
    expect(response.body.data).toEqual({
      title: 'Fluent Gallery | 摄影作品集',
      description: 'Fluent Gallery 是一个记录光影、城市、自然与日常片刻的摄影画廊。',
      keywords: 'Fluent Gallery, 摄影, 摄影作品集, 在线画廊, 光影, 城市摄影',
      author: 'Fluent Gallery', canonicalUrl: '', ogTitle: '', ogDescription: '', ogImage: '',
    });
    expect(JSON.stringify(response.body.data)).not.toContain('Hwangzhun');
  });

  it('keeps an explicitly saved SEO configuration', async () => {
    await agent.put('/api/settings/seo').send(customSeo).expect(200);
    expect((await request(app).get('/api/settings/seo').expect(200)).body.data).toEqual(customSeo);
  });
});
