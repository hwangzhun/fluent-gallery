import { apiFetch } from './config';

export type EngagementDays = 7 | 30 | 90;

export interface EngagementTrendPoint {
  date: string;
  likes: number;
  views: number;
}

export interface EngagementPhotoRank {
  id: string;
  title: string;
  thumbnailUrl: string;
  count: number;
}

export interface RecentLike {
  id: number;
  photoId: string;
  title: string;
  thumbnailUrl: string;
  createdAt: string;
}

export interface EngagementNotificationState {
  unreadLikes: number;
  latestLikeAt: string | null;
  lastReadAt: string | null;
}

export interface EngagementReport {
  days: EngagementDays;
  timeZone: string;
  summary: {
    todayLikes: number;
    todayViews: number;
    periodLikes: number;
    periodViews: number;
    totalLikes: number;
    totalViews: number;
  };
  trend: EngagementTrendPoint[];
  topLikes: EngagementPhotoRank[];
  topViews: EngagementPhotoRank[];
  recentLikes: RecentLike[];
  notifications: EngagementNotificationState;
}

interface ApiResponse<T> { success: boolean; data: T; error?: string }

export class EngagementApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

async function unwrap<T>(response: Response): Promise<T> {
  const result = await response.json() as ApiResponse<T>;
  if (!response.ok || !result.success) throw new EngagementApiError(result.error || '获取互动数据失败', response.status);
  return result.data;
}

export const engagementService = {
  async getReport(days: EngagementDays, signal?: AbortSignal): Promise<EngagementReport> {
    const params = new URLSearchParams({ days: String(days), timeZone: browserTimeZone() });
    return unwrap(await apiFetch(`/engagement/report?${params}`, { signal }));
  },

  async getNotifications(signal?: AbortSignal): Promise<EngagementNotificationState> {
    const params = new URLSearchParams({ timeZone: browserTimeZone() });
    return unwrap(await apiFetch(`/engagement/notifications?${params}`, { signal }));
  },

  async markLikesRead(readThrough: string): Promise<EngagementNotificationState & { readThrough: string }> {
    return unwrap(await apiFetch('/engagement/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readThrough, timeZone: browserTimeZone() }),
    }));
  },
};
