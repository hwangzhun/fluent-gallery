import { randomBytes, scrypt as scryptCallback, createHash, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { dbGet, dbRun } from '../database/db';

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = 'fg_admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

type SessionRow = { id: string; expires_at: string };

function sessionDigest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function parseCookies(request: Request): Record<string, string> {
  return (request.headers.cookie || '').split(';').reduce<Record<string, string>>((cookies, entry) => {
    const [key, ...value] = entry.trim().split('=');
    if (key) cookies[key] = decodeURIComponent(value.join('='));
    return cookies;
  }, {});
}

function setSessionCookie(response: Response, token: string) {
  const attributes = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  response.setHeader('Set-Cookie', attributes.join('; '));
}

function clearSessionCookie(response: Response) {
  response.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

async function matchesPassword(password: string, storedValue: string): Promise<boolean> {
  if (!storedValue.startsWith('scrypt$')) return password === storedValue;
  const [, salt, expectedHash] = storedValue.split('$');
  if (!salt || !expectedHash) return false;
  const actualHash = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHash, 'hex');
  return actualHash.length === expected.length && timingSafeEqual(actualHash, expected);
}

export async function ensureAuthSchema() {
  await dbRun(`CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await dbRun(`CREATE TABLE IF NOT EXISTS admin_sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await dbRun("INSERT OR IGNORE INTO admin_settings (key, value) VALUES ('admin_password', 'admin123')");
}

async function getStoredPassword(): Promise<string> {
  await ensureAuthSchema();
  const row = await dbGet<{ value: string }>("SELECT value FROM admin_settings WHERE key = 'admin_password'");
  return row?.value || 'admin123';
}

async function createSession() {
  const token = randomBytes(32).toString('hex');
  const id = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await dbRun('DELETE FROM admin_sessions WHERE expires_at <= ?', [new Date().toISOString()]);
  await dbRun('INSERT INTO admin_sessions (id, token_hash, expires_at) VALUES (?, ?, ?)', [id, sessionDigest(token), expiresAt]);
  return { id, token, expiresAt };
}

async function findSession(token?: string): Promise<SessionRow | undefined> {
  if (!token) return undefined;
  await ensureAuthSchema();
  return dbGet<SessionRow>('SELECT id, expires_at FROM admin_sessions WHERE token_hash = ? AND expires_at > ?', [sessionDigest(token), new Date().toISOString()]);
}

export async function requireAdmin(request: Request, response: Response, next: NextFunction) {
  try {
    const session = await findSession(parseCookies(request)[COOKIE_NAME]);
    if (!session) return response.status(401).json({ success: false, error: '需要管理员登录', code: 'UNAUTHORIZED' });
    (request as Request & { adminSessionId?: string }).adminSessionId = session.id;
    next();
  } catch (error) {
    next(error);
  }
}

export async function changeAdminPassword(currentPassword: string, newPassword: string, currentSessionId?: string) {
  const storedPassword = await getStoredPassword();
  if (!(await matchesPassword(currentPassword, storedPassword))) throw new Error('当前密码错误');
  await dbRun("UPDATE admin_settings SET value = ?, updated_at = datetime('now') WHERE key = 'admin_password'", [await hashPassword(newPassword)]);
  if (currentSessionId) await dbRun('DELETE FROM admin_sessions WHERE id != ?', [currentSessionId]);
  else await dbRun('DELETE FROM admin_sessions');
}

const router = express.Router();

router.post('/login', async (request, response) => {
  const { password } = request.body as { password?: string };
  if (!password) return response.status(400).json({ success: false, error: '请输入密码' });
  try {
    const storedPassword = await getStoredPassword();
    if (!(await matchesPassword(password, storedPassword))) return response.status(401).json({ success: false, error: '密码错误' });
    if (!storedPassword.startsWith('scrypt$')) {
      await dbRun("UPDATE admin_settings SET value = ?, updated_at = datetime('now') WHERE key = 'admin_password'", [await hashPassword(password)]);
    }
    const session = await createSession();
    setSessionCookie(response, session.token);
    response.json({ success: true, data: { authenticated: true, expiresAt: session.expiresAt } });
  } catch (error: any) {
    response.status(500).json({ success: false, error: '登录失败', message: error.message });
  }
});

router.get('/session', async (request, response) => {
  const session = await findSession(parseCookies(request)[COOKIE_NAME]);
  response.json({ success: true, data: { authenticated: Boolean(session), expiresAt: session?.expires_at } });
});

router.post('/logout', async (request, response) => {
  const token = parseCookies(request)[COOKIE_NAME];
  if (token) await dbRun('DELETE FROM admin_sessions WHERE token_hash = ?', [sessionDigest(token)]);
  clearSessionCookie(response);
  response.json({ success: true });
});

export default router;
