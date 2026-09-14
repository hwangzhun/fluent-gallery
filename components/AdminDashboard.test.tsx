// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AdminDashboard } from './AdminDashboard';

vi.mock('../api/authService', () => ({
  authService: { session: vi.fn().mockResolvedValue({ authenticated: true }), logout: vi.fn() },
}));
vi.mock('./admin/PhotosPanel', () => ({ PhotosPanel: () => <div>照片面板</div> }));
vi.mock('./admin/AlbumsPanel', () => ({ AlbumsPanel: () => <div>画册面板</div> }));
vi.mock('./admin/TagsPanel', () => ({ TagsPanel: () => <div>标签面板</div> }));
vi.mock('./admin/SettingsPanel', () => ({ SettingsPanel: () => <div>设置面板</div> }));
vi.mock('./admin/LogsPanel', () => ({ LogsPanel: () => <div>日志面板</div> }));
vi.mock('./PhotoModal', () => ({ PhotoModal: (props: any) => <div data-presentation={props.presentation}>桌面上传工作区</div> }));

afterEach(cleanup);

describe('admin footer', () => {
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
});
