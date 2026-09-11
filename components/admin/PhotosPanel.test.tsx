// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhotosPanel } from './PhotosPanel';
import { photoService } from '../../api/photoService';

const photos = vi.hoisted(() => [
  { id: 'one', title: '横幅', url: '/one.jpg', thumbnailUrl: '/one-small.jpg', width: 1200, height: 800, year: 2026, tags: [], createdAt: '2026-01-01', likesCount: 7, viewsCount: 19 },
  { id: 'two', title: '竖幅', url: '/two.jpg', thumbnailUrl: '/two-small.jpg', width: 800, height: 1200, year: 2025, tags: [], createdAt: '2025-01-01', likesCount: 3, viewsCount: 11 },
]);

vi.mock('../../api/photoService', () => ({
  photoService: {
    getAdminPhotos: vi.fn().mockResolvedValue({ items: photos, total: 2, page: 1, pageSize: 30, totalPages: 1 }),
    updatePhoto: vi.fn(),
    deletePhoto: vi.fn(),
  },
}));
vi.mock('../../api/tagService', () => ({ tagService: { getAvailableYears: vi.fn().mockResolvedValue([]), getAllTagNames: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../api/photoUploadService', () => ({ photoUploadService: { uploadPhoto: vi.fn() } }));
vi.mock('../PhotoModal', () => ({ PhotoModal: () => null }));

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('PhotosPanel thumbnail sizing', () => {
  it('applies and persists the thumbnail-size slider across list and grid views', async () => {
    const { container } = render(<PhotosPanel onSessionExpired={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByText('横幅')).toBeInTheDocument();
    const slider = screen.getByRole('slider', { name: '调整照片显示大小' });
    fireEvent.change(slider, { target: { value: '170' } });
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.style.getPropertyValue('--studio-thumbnail-size')).toBe('170px');
    expect(panel.style.getPropertyValue('--studio-card-size')).toBe('366px');
    expect(localStorage.getItem('fluent-gallery-admin-thumbnail-size')).toBe('170');
    fireEvent.click(screen.getByRole('button', { name: '网格视图' }));
    expect(container.querySelectorAll('.studio-photo-frame .artwork-image')).toHaveLength(2);
  });

  it('shows interaction totals in both views and reloads with the selected sort', async () => {
    render(<PhotosPanel onSessionExpired={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByLabelText('点赞 7')).toBeInTheDocument();
    expect(screen.getByLabelText('浏览 19')).toBeInTheDocument();
    expect(photoService.getAdminPhotos).toHaveBeenCalledWith(expect.objectContaining({ page: 1, sort: 'latest' }));

    fireEvent.click(screen.getByRole('button', { name: '照片排序' }));
    fireEvent.click(screen.getByRole('option', { name: '最多浏览' }));
    await act(async () => {});
    expect(photoService.getAdminPhotos).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, sort: 'views' }));
    fireEvent.click(screen.getByRole('button', { name: '网格视图' }));
    expect(screen.getAllByLabelText('点赞 7')).toHaveLength(1);
    expect(screen.getAllByLabelText('浏览 19')).toHaveLength(1);
  });

  it('keeps the bulk-edit trigger mounted and transitions its visible state', async () => {
    const { container } = render(<PhotosPanel onSessionExpired={vi.fn()} />);
    await act(async () => {});
    const trigger = container.querySelector<HTMLButtonElement>('.studio-bulk-edit-trigger');
    expect(trigger).toBeDisabled();
    expect(trigger).not.toHaveClass('is-visible');

    fireEvent.click(screen.getByRole('checkbox', { name: '选择 横幅' }));
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveClass('is-visible');
    expect(screen.getByRole('button', { name: '批量修改（1）' })).toBe(trigger);

    fireEvent.click(screen.getByRole('checkbox', { name: '选择 横幅' }));
    expect(trigger).toBeDisabled();
    expect(trigger).not.toHaveClass('is-visible');
  });
});
