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

afterEach(cleanup);

describe('admin footer', () => {
  it('shows the package version injected by Vite', async () => {
    render(<MemoryRouter><AdminDashboard /></MemoryRouter>);
    expect(await screen.findByText('版本 v0.0.0')).toBeInTheDocument();
  });
});
