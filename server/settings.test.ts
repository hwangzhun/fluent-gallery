import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const directory = mkdtempSync(join(tmpdir(), 'fluent-gallery-settings-'));
process.env.GALLERY_DB_PATH = join(directory, 'gallery.db');
const { initDatabase, closeDatabase } = await import('../database/db');
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
    await agent.put('/api/settings/gallery').send({ randomizePhotos: true, heroPhotoId: 'photo-hero', heroImageFit: 'cover' }).expect(200);
    const response = await request(app).get('/api/settings/gallery').expect(200);
    expect(response.body.data).toEqual({ randomizePhotos: true, heroPhotoId: 'photo-hero', heroImageFit: 'cover' });
  });

  it('rejects unsupported Hero fit modes', async () => {
    await agent.put('/api/settings/gallery').send({ randomizePhotos: false, heroPhotoId: null, heroImageFit: 'stretch' }).expect(400);
  });
});
