import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const directory = mkdtempSync(join(tmpdir(), 'fluent-gallery-pages-'));
process.env.GALLERY_DB_PATH = join(directory, 'gallery.db');
process.env.LOCAL_UPLOAD_DIR = join(directory, 'uploads');
process.env.LOCAL_PUBLIC_URL = 'http://localhost:3001/uploads';
const { initDatabase, closeDatabase, dbAll, dbRun } = await import('../database/db');
const { PhotoDao } = await import('../database/dao/photoDao');
const { default: authRouter, ensureAuthSchema } = await import('./auth');
const { default: photoRouter } = await import('./routes/photos');
const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/photos', photoRouter);
const agent = request.agent(app);

beforeAll(async () => {
  await initDatabase(); await ensureAuthSchema();
  const dao = new PhotoDao();
  for (let index = 0; index < 65; index += 1) {
    await dao.createPhoto({ url: `/photos/${index}.webp`, thumbnail_url: `/thumbs/${index}.webp`, title: `Photo ${String(index).padStart(2, '0')}`, year: index % 2 ? 2025 : 2026, width: 1200, height: 800, tags: index % 3 === 0 ? ['city', 'night'] : ['city'] }, `photo-${String(index).padStart(3, '0')}`);
  }
  await agent.post('/api/auth/login').send({ password: 'admin123' }).expect(200);
});
afterAll(async () => { await closeDatabase(); rmSync(directory, { recursive: true, force: true }); });

describe('admin photo pagination', () => {
  it('requires authentication and validates page sizes', async () => {
    await request(app).get('/api/photos/admin').expect(401);
    await agent.get('/api/photos/admin?pageSize=24').expect(400);
  });

  it('returns stable pages and totals', async () => {
    const first = await agent.get('/api/photos/admin?page=1&pageSize=30').expect(200);
    const third = await agent.get('/api/photos/admin?page=3&pageSize=30').expect(200);
    expect(first.body.data).toMatchObject({ total: 65, page: 1, pageSize: 30, totalPages: 3 });
    expect(first.body.data.items).toHaveLength(30);
    expect(third.body.data.items).toHaveLength(5);
    expect(new Set([...first.body.data.items, ...third.body.data.items].map(item => item.id)).size).toBe(35);
  });

  it('applies year, search and multi-tag filters before counting', async () => {
    const result = await agent.get('/api/photos/admin?page=1&pageSize=60&year=2026&tags=city,night&search=Photo').expect(200);
    expect(result.body.data.total).toBe(11);
    expect(result.body.data.items.every((item: any) => item.year === 2026 && item.tags.includes('night'))).toBe(true);
  });

  it('sorts by likes and views before pagination and rejects unsupported sorts', async () => {
    await dbRun("UPDATE photos SET likes_count = CASE id WHEN 'photo-000' THEN 200 WHEN 'photo-064' THEN 100 ELSE 0 END");
    await dbRun("UPDATE photos SET views_count = CASE id WHEN 'photo-001' THEN 300 WHEN 'photo-063' THEN 150 ELSE 0 END");

    const likes = await agent.get('/api/photos/admin?page=1&pageSize=30&sort=likes').expect(200);
    const views = await agent.get('/api/photos/admin?page=1&pageSize=30&sort=views').expect(200);
    expect(likes.body.data.items.slice(0, 2).map((photo: any) => photo.id)).toEqual(['photo-000', 'photo-064']);
    expect(views.body.data.items.slice(0, 2).map((photo: any) => photo.id)).toEqual(['photo-001', 'photo-063']);
    expect(likes.body.data.items[0]).toMatchObject({ likes_count: 200 });
    expect(views.body.data.items[0]).toMatchObject({ views_count: 300 });
    await agent.get('/api/photos/admin?page=1&pageSize=30&sort=popular').expect(400);
  });

  it('creates fresh databases with interaction columns and ranking indexes', async () => {
    const columns = await dbAll<{ name: string }>('PRAGMA table_info(photos)');
    const indexes = await dbAll<{ name: string }>('PRAGMA index_list(photos)');
    expect(columns.map(column => column.name)).toEqual(expect.arrayContaining(['likes_count', 'views_count']));
    expect(indexes.map(index => index.name)).toEqual(expect.arrayContaining(['idx_photos_likes_count', 'idx_photos_views_count']));
  });

  it('stores only processed display and thumbnail WebP files', async () => {
    const sharp = (await import('sharp')).default;
    const source = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#879476' } }).jpeg().toBuffer();
    const response = await agent.post('/api/photos/upload')
      .field('metadata', JSON.stringify({ title: 'Processed', year: 2026, tags: ['upload'], exif: {} }))
      .attach('file', source, { filename: 'source.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(response.body.data.url).toMatch(/\/photos\/.*\.webp$/);
    expect(response.body.data.thumbnail_url).toMatch(/\/thumbs\/.*\.webp$/);
    expect(response.body.processing).toMatchObject({ format: 'webp', width: 1200, height: 800 });
    const files = readdirSync(join(directory, 'uploads'), { recursive: true }).map(String).filter(name => /\.(jpg|webp)$/i.test(name));
    expect(files.filter(name => name.endsWith('.webp'))).toHaveLength(2);
    expect(files.some(name => name.endsWith('.jpg'))).toBe(false);
  });

  it('rejects animated GIF uploads with a clear message', async () => {
    const response = await agent.post('/api/photos/upload')
      .field('metadata', JSON.stringify({ title: 'Animated', year: 2026 }))
      .attach('file', Buffer.from('GIF89a'), { filename: 'animated.gif', contentType: 'image/gif' })
      .expect(400);
    expect(response.body.error).toContain('不支持 GIF 动图');
  });
});
