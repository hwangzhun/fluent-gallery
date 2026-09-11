// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AlbumsPanel } from './AlbumsPanel';
import { albumService } from '../../services/albumService';
import { photoService } from '../../services/photoService';
import type { Photo } from '../../types';
vi.mock('../../services/albumService', () => ({ albumService: { list: vi.fn(), save: vi.fn().mockResolvedValue({}), detail: vi.fn(), remove: vi.fn(), reorder: vi.fn() } }));
vi.mock('../../services/photoService', () => ({ photoService: { getAdminPhotos: vi.fn() } }));
vi.mock('../../services/tagService', () => ({ tagService: { getAvailableYears: vi.fn().mockResolvedValue([2026]), getAllTagNames: vi.fn().mockResolvedValue(['风景']) } }));
const photo: Photo = { id: 'one', title: '第一张', url: '/one', thumbnailUrl: '/one', width: 1200, height: 800, year: 2026, tags: [], createdAt: '', likesCount: 0, viewsCount: 0 };
const second = { ...photo, id: 'two', title: '第二张' };
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(albumService.list).mockResolvedValue([]);
  vi.mocked(photoService.getAdminPhotos).mockImplementation(async ({ page }) => ({ page, pageSize: 30, total: 31, totalPages: 2, items: page === 1 ? [photo] : [second] }));
});
afterEach(cleanup);
it('keeps cross-page choices, allows ordering and independent cover selection, and saves a draft', async () => {
  render(<AlbumsPanel onSessionExpired={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: '新建画册' }));
  fireEvent.change(screen.getByLabelText('画册名称'), { target: { value: '新画册' } });
  fireEvent.click(await screen.findByRole('checkbox', { name: '加入画册：第一张' }));
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: '加入画册：第二张' }));
  expect(screen.getByText('照片编排 · 2 张')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '上移 第二张' }));
  fireEvent.click(screen.getAllByRole('radio', { name: '封面' })[1]);
  fireEvent.click(screen.getByRole('button', { name: '保存画册' }));
  await waitFor(() => expect(albumService.save).toHaveBeenCalledWith(null, { name: '新画册', description: '', published: false, photoIds: ['two', 'one'], coverPhotoId: 'one' }));
});
it('shows save failure without discarding the edited name or selected photos', async () => {
  vi.mocked(albumService.save).mockRejectedValueOnce(new Error('照片已删除，请重新选片'));
  render(<AlbumsPanel onSessionExpired={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: '新建画册' }));
  fireEvent.change(screen.getByLabelText('画册名称'), { target: { value: '保留内容' } });
  fireEvent.click(await screen.findByRole('checkbox', { name: '加入画册：第一张' }));
  fireEvent.click(screen.getByRole('button', { name: '保存画册' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('照片已删除');
  expect(screen.getByLabelText('画册名称')).toHaveValue('保留内容');
  expect(screen.getByText('照片编排 · 1 张')).toBeInTheDocument();
});
