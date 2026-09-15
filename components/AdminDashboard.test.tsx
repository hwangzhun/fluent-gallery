// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AdminDashboard, formatAppVersion } from './AdminDashboard';

vi.mock('../api/authService', () => ({
  authService: { session: vi.fn().mockResolvedValue({ authenticated: true }), logout: vi.fn() },
}));
vi.mock('../api/engagementService', () => ({
  EngagementApiError: class EngagementApiError extends Error { status = 500; },
  engagementService: { getNotifications: vi.fn().mockResolvedValue({ unreadLikes: 2, latestLikeAt: '2026-09-15T08:00:00.000Z', lastReadAt: null }) },
}));
vi.mock('./admin/PhotosPanel', () => ({ PhotosPanel: () => <div>照片面板</div> }));
vi.mock('./admin/EngagementPanel', () => ({ EngagementPanel: () => <div>互动面板</div> }));
vi.mock('./admin/AlbumsPanel', () => ({ AlbumsPanel: () => <div>画册面板</div> }));
vi.mock('./admin/TagsPanel', () => ({ TagsPanel: () => <div>标签面板</div> }));
vi.mock('./admin/SettingsPanel', () => ({ SettingsPanel: () => <div>设置面板</div> }));
vi.mock('./admin/LogsPanel', () => ({ LogsPanel: () => <div>日志面板</div> }));
vi.mock('./PhotoModal', () => ({ PhotoModal: (props: any) => <div data-presentation={props.presentation}>桌面上传工作区</div> }));

afterEach(cleanup);

describe('admin footer', () => {
  it('presents the slim build as a readable edition name', () => {
    expect(formatAppVersion('1.0.8-slim')).toBe('1.0.8 Slim');
  });

  it('shows the package version injected by Vite', async () => {
    render(<MemoryRouter><AdminDashboard /></MemoryRouter>);
    expect(await screen.findByText('版本 V0.0.0')).toBeInTheDocument();
  });

  it('keeps authentication and the studio header around the upload route', async () => {
    render(<MemoryRouter initialEntries={['/admin/upload']}><AdminDashboard /></MemoryRouter>);
    expect(await screen.findByText('桌面上传工作区')).toHaveAttribute('data-presentation', 'workspace');
    expect(screen.getByRole('link', { name: 'Fluent Gallery' })).toBeInTheDocument();
    expect(screen.queryByText('照片面板')).not.toBeInTheDocument();
  });

  it('shows an unread-like dot and opens the engagement section without clearing it', async () => {
    render(<MemoryRouter><AdminDashboard /></MemoryRouter>);
    const entry = await screen.findByRole('button', { name: /互动数据/ });
    expect(await screen.findByLabelText('今日有 2 个未读点赞')).toBeInTheDocument();
    entry.click();
    expect(await screen.findByText('互动面板')).toBeInTheDocument();
    expect(screen.getByLabelText('今日有 2 个未读点赞')).toBeInTheDocument();
  });
});
