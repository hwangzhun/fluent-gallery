import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const directory = mkdtempSync(join(tmpdir(), 'fluent-gallery-tags-'));
process.env.GALLERY_DB_PATH = join(directory, 'gallery.db');
const { initDatabase, closeDatabase } = await import('../database/db');
const { PhotoDao } = await import('../database/dao/photoDao');
const { default: authRouter } = await import('./auth');
const { default: tagsRouter } = await import('./routes/tags');
const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/tags', tagsRouter);
const agent = request.agent(app);

beforeAll(async () => {
  await initDatabase();
  const photoDao = new PhotoDao();
  await photoDao.createPhoto({ url: '/one.webp', thumbnail_url: '/one-thumb.webp', title: 'One', year: 2026, width: 1200, height: 800, tags: ['city', 'night'] }, 'photo-one');
  await photoDao.createPhoto({ url: '/two.webp', thumbnail_url: '/two-thumb.webp', title: 'Two', year: 2025, width: 800, height: 1200, tags: ['city'] }, 'photo-two');
  await agent.post('/api/auth/login').send({ password: 'admin123' }).expect(200);
});

afterAll(async () => { await closeDatabase(); rmSync(directory, { recursive: true, force: true }); });

describe('admin tag management', () => {
  it('protects the admin listing and returns photo usage counts', async () => {
    await request(app).get('/api/tags/admin').expect(401);
    const response = await agent.get('/api/tags/admin').expect(200);
    expect(response.body.data.find((tag: any) => tag.name === 'city')).toMatchObject({ photoCount: 2 });
    expect(response.body.data.find((tag: any) => tag.name === 'night')).toMatchObject({ photoCount: 1 });
  });

  it('creates and renames tags while validating empty and conflicting names', async () => {
    const created = await agent.post('/api/tags').send({ name: ' portrait ' }).expect(201);
    await agent.put(`/api/tags/${created.body.data.id}`).send({ name: 'people' }).expect(200);
    const renamed = await agent.get('/api/tags/admin').expect(200);
    expect(renamed.body.data.some((tag: any) => tag.name === 'people')).toBe(true);
    await agent.put(`/api/tags/${created.body.data.id}`).send({ name: '   ' }).expect(400);
    const conflict = await agent.put(`/api/tags/${created.body.data.id}`).send({ name: 'city' }).expect(409);
    expect(conflict.body.error).toContain('已存在');
  });

  it('deletes an in-use tag by detaching it without deleting photos', async () => {
    const list = await agent.get('/api/tags/admin').expect(200);
    const night = list.body.data.find((tag: any) => tag.name === 'night');
    expect(night.photoCount).toBe(1);
    await agent.delete(`/api/tags/${night.id}`).expect(200);

    const photoDao = new PhotoDao();
    const photo = await photoDao.getPhotoWithTagsById('photo-one');
    expect(photo).not.toBeNull();
    expect(photo?.tags).toEqual(['city']);
    expect(await photoDao.getPhotoWithTagsById('photo-two')).not.toBeNull();
  });
});
