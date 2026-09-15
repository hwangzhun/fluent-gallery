// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngagementPanel } from './EngagementPanel';
import { engagementService } from '../../api/engagementService';

const report = {
  days: 7 as const,
  timeZone: 'Asia/Hong_Kong',
  summary: { todayLikes: 2, todayViews: 8, periodLikes: 5, periodViews: 21, totalLikes: 40, totalViews: 300 },
  trend: Array.from({ length: 7 }, (_, index) => ({ date: `2026-09-${String(index + 9).padStart(2, '0')}`, likes: index, views: index * 2 })),
  topLikes: [{ id: 'one', title: '夜色', thumbnailUrl: '/one.jpg', count: 4 }],
  topViews: [{ id: 'two', title: '山川', thumbnailUrl: '/two.jpg', count: 18 }],
  recentLikes: [{ id: 9, photoId: 'one', title: '夜色', thumbnailUrl: '/one.jpg', createdAt: '2026-09-15T08:00:00.000Z' }],
  notifications: { unreadLikes: 2, latestLikeAt: '2026-09-15T08:00:00.000Z', lastReadAt: null },
};

vi.mock('../../api/engagementService', () => {
  class EngagementApiError extends Error { constructor(message: string, public status: number) { super(message); } }
  return {
    EngagementApiError,
    engagementService: {
      getReport: vi.fn(),
      getNotifications: vi.fn(),
      markLikesRead: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.mocked(engagementService.getReport).mockResolvedValue(report);
  vi.mocked(engagementService.markLikesRead).mockResolvedValue({ unreadLikes: 0, latestLikeAt: report.notifications.latestLikeAt, lastReadAt: report.notifications.latestLikeAt, readThrough: report.notifications.latestLikeAt });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('EngagementPanel', () => {
  it('renders summaries, accessible trend data, rankings and recent likes', async () => {
    render(<EngagementPanel onSessionExpired={vi.fn()} onNotificationChange={vi.fn()} />);
    expect(await screen.findByText('今日点赞')).toBeInTheDocument();
    expect(screen.getByText('300')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /点赞与浏览趋势/ })).toBeInTheDocument();
    expect(screen.getAllByText('夜色').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('山川')).toBeInTheDocument();
  });

  it('keeps all 20 recent likes in the compact scroll region', async () => {
    const recentLikes = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      photoId: `photo-${index + 1}`,
      title: `最近作品 ${index + 1}`,
      thumbnailUrl: `/recent-${index + 1}.jpg`,
      createdAt: `2026-09-15T${String(index).padStart(2, '0')}:00:00.000Z`,
    }));
    vi.mocked(engagementService.getReport).mockResolvedValue({ ...report, recentLikes });

    render(<EngagementPanel onSessionExpired={vi.fn()} onNotificationChange={vi.fn()} />);

    const list = await screen.findByRole('list', { name: '最近点赞记录' });
    expect(list).toHaveAttribute('tabindex', '0');
    expect(list.querySelectorAll('li')).toHaveLength(20);
    expect(screen.getByText('最近作品 20')).toBeInTheDocument();
  });

  it('reloads the report when the range changes', async () => {
    render(<EngagementPanel onSessionExpired={vi.fn()} onNotificationChange={vi.fn()} />);
    await screen.findByText('今日点赞');
    fireEvent.click(screen.getByRole('button', { name: '30 天' }));
    await waitFor(() => expect(engagementService.getReport).toHaveBeenLastCalledWith(30, expect.any(AbortSignal)));
  });

  it('marks only the displayed latest like as read and updates the notification state', async () => {
    const onNotificationChange = vi.fn();
    render(<EngagementPanel onSessionExpired={vi.fn()} onNotificationChange={onNotificationChange} />);
    fireEvent.click(await screen.findByRole('button', { name: '全部已读（2）' }));
    await waitFor(() => expect(engagementService.markLikesRead).toHaveBeenCalledWith(report.notifications.latestLikeAt));
    expect(await screen.findByRole('button', { name: '今日已读' })).toBeDisabled();
    expect(onNotificationChange).toHaveBeenLastCalledWith(expect.objectContaining({ unreadLikes: 0 }));
  });
});
