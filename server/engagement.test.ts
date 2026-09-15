import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const directory = mkdtempSync(join(tmpdir(), 'fluent-gallery-engagement-'));
process.env.GALLERY_DB_PATH = join(directory, 'gallery.db');
const { initDatabase, closeDatabase, dbRun } = await import('../database/db');
const { PhotoDao } = await import('../database/dao/photoDao');
const { default: authRouter, ensureAuthSchema, requireAdmin } = await import('./auth');
const { default: engagementRouter } = await import('./routes/engagement');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/engagement', requireAdmin, engagementRouter);
const agent = request.agent(app);
const secondAgent = request.agent(app);

const isoDaysAgo = (days: number, minuteOffset = 0) => new Date(Date.now() - days * 86_400_000 + minuteOffset * 60_000).toISOString();

beforeAll(async () => {
  await initDatabase(); await ensureAuthSchema();
  const photos = new PhotoDao();
  await photos.createPhoto({ url: '/one.webp', thumbnail_url: '/one-thumb.webp', title: '夜色', year: 2026, width: 1200, height: 800, tags: [] }, 'one');
  await photos.createPhoto({ url: '/two.webp', thumbnail_url: '/two-thumb.webp', title: '山川', year: 2026, width: 1200, height: 800, tags: [] }, 'two');
  await dbRun('INSERT INTO photo_likes(photo_id, fingerprint, created_at) VALUES (?, ?, ?)', ['one', 'a', isoDaysAgo(0, -2)]);
  await dbRun('INSERT INTO photo_likes(photo_id, fingerprint, created_at) VALUES (?, ?, ?)', ['one', 'b', isoDaysAgo(0, -1)]);
  await dbRun('INSERT INTO photo_likes(photo_id, fingerprint, created_at) VALUES (?, ?, ?)', ['two', 'c', isoDaysAgo(2)]);
  await dbRun('INSERT INTO photo_likes(photo_id, fingerprint, created_at) VALUES (?, ?, ?)', ['two', 'old', isoDaysAgo(100)]);
  await dbRun('INSERT INTO photo_views(photo_id, fingerprint, created_at) VALUES (?, ?, ?)', ['two', 'v1', isoDaysAgo(0, -1)]);
  await dbRun('INSERT INTO photo_views(photo_id, fingerprint, created_at) VALUES (?, ?, ?)', ['one', 'v2', isoDaysAgo(1)]);
  await dbRun("UPDATE photos SET likes_count = (SELECT COUNT(*) FROM photo_likes WHERE photo_id = photos.id), views_count = (SELECT COUNT(*) FROM photo_views WHERE photo_id = photos.id)");
  await agent.post('/api/auth/login').send({ password: 'admin123' }).expect(200);
  await secondAgent.post('/api/auth/login').send({ password: 'admin123' }).expect(200);
});

afterAll(async () => { await closeDatabase(); rmSync(directory, { recursive: true, force: true }); });

describe('engagement report', () => {
  it('requires an admin session and validates the supported ranges', async () => {
    await request(app).get('/api/engagement/report').expect(401);
    await request(app).get('/api/engagement/notifications').expect(401);
    await request(app).post('/api/engagement/notifications/read').send({ readThrough: new Date().toISOString() }).expect(401);
    await agent.get('/api/engagement/report?days=14').expect(400);
  });

  it('returns summaries, zero-filled daily trends, rankings and private recent activity', async () => {
    const result = await agent.get('/api/engagement/report?days=7&timeZone=UTC').expect(200);
    expect(result.body.data.summary).toEqual({ todayLikes: 2, todayViews: 1, periodLikes: 3, periodViews: 2, totalLikes: 4, totalViews: 2 });
    expect(result.body.data.trend).toHaveLength(7);
    expect(result.body.data.trend.reduce((sum: number, point: any) => sum + point.likes, 0)).toBe(3);
    expect(result.body.data.topLikes[0]).toMatchObject({ id: 'one', title: '夜色', count: 2 });
    expect(result.body.data.topViews.map((item: any) => item.id)).toEqual(['two', 'one']);
    expect(result.body.data.recentLikes[0]).toMatchObject({ photoId: 'one', title: '夜色' });
    expect(result.body.data.recentLikes[0]).not.toHaveProperty('fingerprint');
    expect(result.body.data.recentLikes[0]).not.toHaveProperty('ipAddress');
    expect(result.body.data.notifications).toMatchObject({ unreadLikes: 2, lastReadAt: null });
  });

  it('falls back to UTC for an invalid time zone', async () => {
    const result = await agent.get('/api/engagement/report?days=30&timeZone=not-a-zone').expect(200);
    expect(result.body.data.timeZone).toBe('UTC');
    expect(result.body.data.trend).toHaveLength(30);
    expect((await agent.get('/api/engagement/report?days=90&timeZone=UTC').expect(200)).body.data.trend).toHaveLength(90);
  });

  it('shares the read cursor across sessions without clearing a later like', async () => {
    const before = await agent.get('/api/engagement/notifications?timeZone=UTC').expect(200);
    const through = before.body.data.latestLikeAt;
    await dbRun('INSERT INTO photo_likes(photo_id, fingerprint, created_at) VALUES (?, ?, ?)', ['two', 'later', isoDaysAgo(0)]);
    const marked = await agent.post('/api/engagement/notifications/read').send({ readThrough: through, timeZone: 'UTC' }).expect(200);
    expect(marked.body.data).toMatchObject({ readThrough: through, unreadLikes: 1, lastReadAt: through });
    const shared = await secondAgent.get('/api/engagement/notifications?timeZone=UTC').expect(200);
    expect(shared.body.data).toMatchObject({ unreadLikes: 1, lastReadAt: through });
    await agent.post('/api/engagement/notifications/read').send({ readThrough: 'not-a-date', timeZone: 'UTC' }).expect(400);
  });
});
