import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const directory = mkdtempSync(join(tmpdir(), 'fluent-gallery-test-'));
process.env.GALLERY_DB_PATH = join(directory, 'gallery.db');
const { default: authRouter, requireAdmin } = await import('./auth');
const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.get('/admin-only', requireAdmin, (_request, response) => response.json({ success: true }));

beforeAll(() => undefined);
afterAll(async () => { const { closeDatabase } = await import('../database/db'); await closeDatabase(); rmSync(directory, { recursive: true, force: true }); });

describe('administrator session', () => {
  it('rejects protected routes without a session and accepts a legacy password after migration', async () => {
    await request(app).get('/admin-only').expect(401);
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ password: 'admin123' }).expect(200);
    await agent.get('/admin-only').expect(200);
    const { dbGet } = await import('../database/db');
    const row = await dbGet<{ value: string }>("SELECT value FROM admin_settings WHERE key = 'admin_password'");
    expect(row?.value.startsWith('scrypt$')).toBe(true);
  });
});
