// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AlbumsPage } from './AlbumsPage';
import { albumService } from '../api/albumService';
import { viewService } from '../api/viewService';
import type { Photo } from '../types';
vi.mock('../api/albumService', () => ({ albumService: { list: vi.fn(), detail: vi.fn() } }));
vi.mock('../api/likeService', () => ({ likeService: { isLiked: vi.fn().mockReturnValue(false), getLikeStatus: vi.fn().mockResolvedValue({ liked: false, likesCount: 0 }), likePhoto: vi.fn() } }));
vi.mock('../api/viewService', () => ({ viewService: { getViewStatus: vi.fn().mockResolvedValue({ viewsCount: 0 }), recordView: vi.fn().mockResolvedValue({ viewsCount: 1 }) } }));
const photo: Photo = { id: 'first', title: '第一张', url: '/first.jpg', thumbnailUrl: '/first-thumb.jpg', width: 800, height: 1200, year: 2026, tags: [], createdAt: '', likesCount: 0, viewsCount: 0 };
const second = { ...photo, id: 'second', title: '第二张', width: 1600, height: 900 };
const album = { id: 'album', name: '旅行', description: '一段旅程', published: true, coverPhotoId: 'second', photoCount: 2, position: 0, previews: [second, photo] };
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}:{location.state?.scrollTo}</output>; }
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(albumService.list).mockResolvedValue([album]);
  vi.mocked(albumService.detail).mockResolvedValue({ ...album, photos: [photo, second] });
  Object.defineProperties(HTMLDialogElement.prototype, { showModal: { configurable: true, value: function () { this.setAttribute('open', ''); } }, close: { configurable: true, value: function () { this.removeAttribute('open'); } } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
function renderAlbums() { return render(<MemoryRouter initialEntries={['/albums']}><AlbumsPage /><Location /></MemoryRouter>); }
describe('album browsing', () => {
  it('stacks actual previews, opens in member order, confines navigation and restores focus', async () => {
    const { container } = renderAlbums();
    const card = await screen.findByRole('button', { name: '打开画册：旅行，2 张照片' });
    const stack = container.querySelector<HTMLElement>('.album-stack');
    const prints = container.querySelectorAll<HTMLElement>('.album-print');
    expect(prints).toHaveLength(2);
    expect(stack?.style.aspectRatio).toBe('1600 / 900');
    expect(prints[0].style.aspectRatio).toBe('1600 / 900');
    expect(prints[1].style.aspectRatio).toBe('800 / 1200');
    expect(Number.parseFloat(prints[1].style.width)).toBeCloseTo(37.5);
    fireEvent.click(card);
    const dialog = await screen.findByRole('dialog', { name: '作品：第一张' });
    expect(screen.getByRole('button', { name: '上一幅作品' })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: '作品：第二张' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一幅作品' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '关闭大图' }));
    await waitFor(() => expect(card).toHaveFocus());
    expect(document.body.style.overflow).not.toBe('hidden');
  });
  it('handles empty, failed and retried album lists', async () => {
    vi.mocked(albumService.list).mockRejectedValueOnce(new Error('网络暂时不可用')).mockResolvedValueOnce([]);
    renderAlbums();
    expect(await screen.findByRole('alert')).toHaveTextContent('网络暂时不可用');
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(await screen.findByText('新的一册，静待展开。')).toBeInTheDocument();
  });
  it('shares photos opened from an album with a stable deep link', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    renderAlbums();
    expect(await screen.findByText('城市向前，光线移动，人群经过。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /打开画册/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '分享作品：第一张' }));
    await act(async () => {});
    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      title: '第一张',
      url: expect.stringContaining('#/?photo=first'),
    }));
    expect(screen.getByText('已打开分享')).toBeInTheDocument();
  });
  it('handles albums unpublished after listing and keeps the list usable', async () => {
    vi.mocked(albumService.detail).mockRejectedValue(new Error('画册不存在或未发布'));
    renderAlbums();
    fireEvent.click(await screen.findByRole('button', { name: /打开画册/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('画册不存在或未发布');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /打开画册/ })).toBeEnabled();
  });
  it('returns cross-page navigation to the intended homepage section', async () => {
    renderAlbums(); await screen.findByRole('button', { name: /打开画册/ });
    fireEvent.click(screen.getByRole('button', { name: '关于画廊' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/:gallery-note');
  });
  it('records views only in the lightbox and only once per opened photo', async () => {
    renderAlbums(); const card = await screen.findByRole('button', { name: /打开画册/ });
    expect(viewService.recordView).not.toHaveBeenCalled();
    vi.useFakeTimers(); fireEvent.click(card); await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(viewService.recordView).toHaveBeenCalledExactlyOnceWith('first');
    fireEvent.click(screen.getByRole('button', { name: '作品信息' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(viewService.recordView).toHaveBeenCalledOnce();
  });
});
