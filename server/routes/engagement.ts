import express from 'express';
import { dbAll, dbGet, dbRun } from '../../database/db';

const router = express.Router();
const READ_SETTING_KEY = 'engagement_likes_read_at';
const VALID_DAYS = new Set([7, 30, 90]);

type InteractionRow = { kind: 'like' | 'view'; created_at: string };
type CountRow = { count: number };
type RankRow = { id: string; title: string; thumbnail_url: string; count: number };

function validTimeZone(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return value;
  } catch {
    return 'UTC';
  }
}

function parseTimestamp(value: string): Date {
  return new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
}

function dateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftDateKey(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// Intl exposes zone offsets but not a direct "local midnight to instant" API.
// Iterating converges across ordinary offsets and daylight-saving boundaries.
function zonedMidnight(value: string, timeZone: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const desired = Date.UTC(year, month - 1, day);
  let instant = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === type)?.value || 0);
    const represented = Date.UTC(number('year'), number('month') - 1, number('day'), number('hour'), number('minute'), number('second'));
    instant += desired - represented;
  }
  return new Date(instant).toISOString();
}

function dateWindow(days: number, timeZone: string) {
  const today = dateKey(new Date(), timeZone);
  const keys = Array.from({ length: days }, (_, index) => shiftDateKey(today, index - days + 1));
  return {
    today,
    keys,
    start: zonedMidnight(keys[0], timeZone),
    todayStart: zonedMidnight(today, timeZone),
    end: zonedMidnight(shiftDateKey(today, 1), timeZone),
  };
}

async function readAt(): Promise<string | null> {
  const row = await dbGet<{ value: string }>('SELECT value FROM admin_settings WHERE key = ?', [READ_SETTING_KEY]);
  return row?.value || null;
}

async function notificationState(timeZone: string) {
  const window = dateWindow(1, timeZone);
  const lastReadAt = await readAt();
  const threshold = lastReadAt && Date.parse(lastReadAt) > Date.parse(window.todayStart) ? lastReadAt : window.todayStart;
  const [count, latest] = await Promise.all([
    dbGet<CountRow>(
      `SELECT COUNT(*) AS count FROM photo_likes
       WHERE julianday(created_at) > julianday(?) AND julianday(created_at) < julianday(?)`,
      [threshold, window.end],
    ),
    dbGet<{ created_at: string }>('SELECT created_at FROM photo_likes ORDER BY julianday(created_at) DESC LIMIT 1'),
  ]);
  return {
    unreadLikes: Math.max(0, count?.count || 0),
    latestLikeAt: latest?.created_at ? parseTimestamp(latest.created_at).toISOString() : null,
    lastReadAt,
  };
}

router.get('/notifications', async (request, response, next) => {
  try {
    response.json({ success: true, data: await notificationState(validTimeZone(request.query.timeZone)) });
  } catch (error) { next(error); }
});

router.post('/notifications/read', async (request, response, next) => {
  try {
    const timeZone = validTimeZone(request.body?.timeZone);
    const readThrough = typeof request.body?.readThrough === 'string' ? request.body.readThrough : '';
    const timestamp = Date.parse(readThrough);
    if (!readThrough || !Number.isFinite(timestamp) || timestamp > Date.now() + 60_000) {
      return response.status(400).json({ success: false, error: 'readThrough 必须是有效且不晚于当前时间的 ISO 时间' });
    }
    const normalized = new Date(timestamp).toISOString();
    const existing = await readAt();
    const saved = existing && Date.parse(existing) > timestamp ? existing : normalized;
    await dbRun(
      `INSERT INTO admin_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [READ_SETTING_KEY, saved],
    );
    response.json({ success: true, data: { ...(await notificationState(timeZone)), readThrough: saved } });
  } catch (error) { next(error); }
});

router.get('/report', async (request, response, next) => {
  try {
    const days = Number(request.query.days ?? 7);
    if (!VALID_DAYS.has(days)) return response.status(400).json({ success: false, error: 'days 仅支持 7、30 或 90' });
    const timeZone = validTimeZone(request.query.timeZone);
    const window = dateWindow(days, timeZone);
    const range = [window.start, window.end];
    const todayRange = [window.todayStart, window.end];

    const [totals, periodLikes, periodViews, todayLikes, todayViews, events, topLikes, topViews, recentLikes, notifications] = await Promise.all([
      dbGet<{ likes: number; views: number }>('SELECT COALESCE(SUM(likes_count), 0) AS likes, COALESCE(SUM(views_count), 0) AS views FROM photos'),
      dbGet<CountRow>('SELECT COUNT(*) AS count FROM photo_likes WHERE julianday(created_at) >= julianday(?) AND julianday(created_at) < julianday(?)', range),
      dbGet<CountRow>('SELECT COUNT(*) AS count FROM photo_views WHERE julianday(created_at) >= julianday(?) AND julianday(created_at) < julianday(?)', range),
      dbGet<CountRow>('SELECT COUNT(*) AS count FROM photo_likes WHERE julianday(created_at) >= julianday(?) AND julianday(created_at) < julianday(?)', todayRange),
      dbGet<CountRow>('SELECT COUNT(*) AS count FROM photo_views WHERE julianday(created_at) >= julianday(?) AND julianday(created_at) < julianday(?)', todayRange),
      dbAll<InteractionRow>(
        `SELECT 'like' AS kind, created_at FROM photo_likes WHERE julianday(created_at) >= julianday(?) AND julianday(created_at) < julianday(?)
         UNION ALL
         SELECT 'view' AS kind, created_at FROM photo_views WHERE julianday(created_at) >= julianday(?) AND julianday(created_at) < julianday(?)`,
        [...range, ...range],
      ),
      dbAll<RankRow>(
        `SELECT p.id, p.title, p.thumbnail_url, COUNT(l.id) AS count FROM photo_likes l
         INNER JOIN photos p ON p.id = l.photo_id
         WHERE julianday(l.created_at) >= julianday(?) AND julianday(l.created_at) < julianday(?)
         GROUP BY p.id, p.title, p.thumbnail_url ORDER BY count DESC, MAX(julianday(l.created_at)) DESC, p.id LIMIT 10`,
        range,
      ),
      dbAll<RankRow>(
        `SELECT p.id, p.title, p.thumbnail_url, COUNT(v.id) AS count FROM photo_views v
         INNER JOIN photos p ON p.id = v.photo_id
         WHERE julianday(v.created_at) >= julianday(?) AND julianday(v.created_at) < julianday(?)
         GROUP BY p.id, p.title, p.thumbnail_url ORDER BY count DESC, MAX(julianday(v.created_at)) DESC, p.id LIMIT 10`,
        range,
      ),
      dbAll<{ id: number; photo_id: string; title: string; thumbnail_url: string; created_at: string }>(
        `SELECT l.id, l.photo_id, p.title, p.thumbnail_url, l.created_at FROM photo_likes l
         INNER JOIN photos p ON p.id = l.photo_id ORDER BY julianday(l.created_at) DESC, l.id DESC LIMIT 20`,
      ),
      notificationState(timeZone),
    ]);

    const trend = new Map(window.keys.map(key => [key, { date: key, likes: 0, views: 0 }]));
    events.forEach(event => {
      const point = trend.get(dateKey(parseTimestamp(event.created_at), timeZone));
      if (point) event.kind === 'like' ? point.likes += 1 : point.views += 1;
    });
    const rank = (rows: RankRow[]) => rows.map(row => ({ id: row.id, title: row.title, thumbnailUrl: row.thumbnail_url, count: Math.max(0, row.count || 0) }));

    response.json({
      success: true,
      data: {
        days,
        timeZone,
        summary: {
          todayLikes: Math.max(0, todayLikes?.count || 0), todayViews: Math.max(0, todayViews?.count || 0),
          periodLikes: Math.max(0, periodLikes?.count || 0), periodViews: Math.max(0, periodViews?.count || 0),
          totalLikes: Math.max(0, totals?.likes || 0), totalViews: Math.max(0, totals?.views || 0),
        },
        trend: [...trend.values()],
        topLikes: rank(topLikes),
        topViews: rank(topViews),
        recentLikes: recentLikes.map(item => ({
          id: item.id, photoId: item.photo_id, title: item.title, thumbnailUrl: item.thumbnail_url,
          createdAt: parseTimestamp(item.created_at).toISOString(),
        })),
        notifications,
      },
    });
  } catch (error) { next(error); }
});

export default router;
