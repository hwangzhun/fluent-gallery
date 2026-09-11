// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MasonryGallery } from './MasonryGallery';
import { Lightbox } from './Lightbox';
import { viewService } from '../services';
import type { Photo } from '../types';

vi.mock('../services', () => ({
  likeService: {
    isLiked: vi.fn().mockReturnValue(false),
    getLikeStatus: vi.fn().mockResolvedValue({ liked: false, likesCount: 0 }),
    likePhoto: vi.fn().mockResolvedValue({ liked: true, likesCount: 1 }),
  },
  viewService: {
    getViewStatus: vi.fn().mockResolvedValue({ viewsCount: 0 }),
    recordView: vi.fn().mockResolvedValue({ viewsCount: 1 }),
  },
}));
vi.mock('../services/tagService', () => ({
  tagService: {
    getAllTagNames: vi.fn().mockResolvedValue(['街巷']),
    getAvailableYears: vi.fn().mockResolvedValue([2026, 2025]),
  },
}));

const first: Photo = { id: 'one', title: '树影', url: '/one.jpg', thumbnailUrl: '/one-small.jpg', width: 1200, height: 800, year: 2026, tags: ['街巷'], createdAt: '2026-01-01', likesCount: 0, viewsCount: 0 };
const second: Photo = { ...first, id: 'two', title: '街角', url: '/two.jpg', thumbnailUrl: '/two-small.jpg', year: 2025 };
const galleryProps = { photos: [first, second], loading: false, error: null, filter: { year: null, tag: null }, gallerySettings: { randomizePhotos: false, heroPhotoId: null, heroImageFit: 'contain' as const }, onFilterChange: vi.fn(), onRetry: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom does not implement native dialog methods; browser checks cover focus containment.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function () { this.setAttribute('open', ''); } },
    close: { configurable: true, value: function () { this.removeAttribute('open'); } },
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('public gallery', () => {
  it('keeps the cover while filtering and after a reordered response', async () => {
    const { rerender } = render(<MasonryGallery {...galleryProps} />);
    await act(async () => {});
    expect(screen.getByRole('button', { name: '查看封面作品：树影' })).toBeInTheDocument();
    rerender(<MasonryGallery {...galleryProps} photos={[second]} filter={{ year: 2025, tag: null }} />);
    expect(screen.getByRole('button', { name: '查看封面作品：树影' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看作品：树影' })).not.toBeInTheDocument();
    rerender(<MasonryGallery {...galleryProps} photos={[second, first]} />);
    expect(screen.getByRole('button', { name: '查看封面作品：树影' })).toBeInTheDocument();
  });

  it('allows a cover outside the filtered collection to open without invalid navigation', async () => {
    const { rerender } = render(<MasonryGallery {...galleryProps} />);
    await act(async () => {});
    rerender(<MasonryGallery {...galleryProps} photos={[second]} filter={{ year: 2025, tag: null }} />);
    fireEvent.click(screen.getByRole('button', { name: '查看封面作品：树影' }));
    await act(async () => {});
    expect(screen.getByRole('dialog', { name: '作品：树影' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一幅作品' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '上一幅作品' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '关闭大图' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('uses the configured Hero photo and its fill mode', async () => {
    const portrait = { ...second, id: 'portrait', title: '竖幅封面', width: 800, height: 1200 };
    render(<MasonryGallery {...galleryProps} photos={[first, portrait]} gallerySettings={{ randomizePhotos: false, heroPhotoId: portrait.id, heroImageFit: 'cover' }} />);
    await act(async () => {});
    const hero = screen.getByRole('button', { name: '查看封面作品：竖幅封面' });
    expect(hero).toHaveClass('is-cover');
  });

  it('randomizes only the unfiltered client-side waterfall', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { container, rerender } = render(<MasonryGallery {...galleryProps} gallerySettings={{ ...galleryProps.gallerySettings, randomizePhotos: true }} />);
    await act(async () => {});
    expect(Array.from(container.querySelectorAll('.gallery-artwork-title h3')).map(node => node.textContent)).toEqual(['街角', '树影']);
    rerender(<MasonryGallery {...galleryProps} filter={{ year: 2026, tag: null }} gallerySettings={{ ...galleryProps.gallerySettings, randomizePhotos: true }} />);
    await act(async () => {});
    expect(Array.from(container.querySelectorAll('.gallery-artwork-title h3')).map(node => node.textContent)).toEqual(['树影', '街角']);
  });

  it('distinguishes connection failure from an empty filtered collection', async () => {
    const { rerender } = render(<MasonryGallery {...galleryProps} photos={[]} error="暂时无法连接画廊" />);
    await act(async () => {});
    expect(screen.getByRole('alert')).toHaveTextContent('暂时无法连接画廊');
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(galleryProps.onRetry).toHaveBeenCalledOnce();
    rerender(<MasonryGallery {...galleryProps} photos={[]} filter={{ year: 2025, tag: null }} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看全部作品' }));
    expect(galleryProps.onFilterChange).toHaveBeenCalledWith({ year: null, tag: null });
  });

  it('offers an incremental loading control while more photos are available', () => {
    const onLoadMore = vi.fn();
    render(<MasonryGallery {...galleryProps} totalPhotos={65} hasMore onLoadMore={onLoadMore} />);
    expect(screen.getByRole('status')).toHaveTextContent('65');
    fireEvent.click(screen.getByRole('button', { name: '继续浏览' }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it('records only a viewed artwork after quick navigation and cancels the timer on close', async () => {
    vi.useFakeTimers();
    const props = { onClose: vi.fn(), onNext: vi.fn(), onPrev: vi.fn(), hasNext: true, hasPrev: false };
    const { rerender, unmount } = render(<Lightbox {...props} photo={first} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    rerender(<Lightbox {...props} photo={second} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(viewService.recordView).toHaveBeenCalledExactlyOnceWith('two');
    rerender(<Lightbox {...props} photo={first} />);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(viewService.recordView).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
