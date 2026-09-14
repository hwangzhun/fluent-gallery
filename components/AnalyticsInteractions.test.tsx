// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { likeService } from '../api/likeService';
import { analytics } from '../api/analyticsService';
import { GalleryFilters } from './GalleryFilters';
import { Lightbox } from './Lightbox';
import { PhotoCard } from './PhotoCard';
import type { Photo } from '../types';

vi.mock('../api/likeService', () => ({
  likeService: {
    isLiked: vi.fn().mockReturnValue(false),
    getLikeStatus: vi.fn().mockResolvedValue({ liked: false, likesCount: 0 }),
    likePhoto: vi.fn().mockResolvedValue({ liked: true, likesCount: 1, created: true }),
  },
}));
vi.mock('../api/viewService', () => ({
  viewService: {
    getViewStatus: vi.fn().mockResolvedValue({ viewed: false, viewsCount: 0 }),
    recordView: vi.fn().mockResolvedValue({ viewed: true, viewsCount: 1 }),
  },
}));
vi.mock('../api/tagService', () => ({ tagService: {
  getAllTagNames: vi.fn().mockResolvedValue(['街巷']),
  getAvailableYears: vi.fn().mockResolvedValue([2026]),
} }));

const photo: Photo = { id: 'photo-one', title: '树影', url: '/one.jpg', thumbnailUrl: '/one-small.jpg', width: 1200, height: 800, year: 2026, tags: ['街巷'], createdAt: '', likesCount: 0, viewsCount: 0 };

beforeEach(() => {
  analytics.reset();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function () { this.setAttribute('open', ''); } },
    close: { configurable: true, value: function () { this.removeAttribute('open'); } },
  });
});
afterEach(() => { cleanup(); analytics.reset(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('semantic analytics wiring', () => {
  it('reports filters and layout choices with normalized values', async () => {
    const filter = vi.spyOn(analytics, 'galleryFilter');
    const layout = vi.spyOn(analytics, 'galleryLayout');
    render(<GalleryFilters filter={{ year: null, tag: null }} onFilterChange={vi.fn()} compact={false} onCompactChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '街巷' }));
    fireEvent.click(screen.getByRole('button', { name: '紧凑布局' }));
    expect(filter).toHaveBeenCalledWith('tag', '街巷');
    expect(layout).toHaveBeenCalledWith('compact');
  });

  it('reports successful gallery-card likes only after the request succeeds', async () => {
    const like = vi.spyOn(analytics, 'photoLike');
    render(<PhotoCard photo={photo} index={0} onClick={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '喜欢 树影' }));
    await act(async () => {});
    expect(like).toHaveBeenCalledWith(photo.id, 'gallery');
  });

  it('does not report a like when the server says the photo was already liked', async () => {
    vi.mocked(likeService.likePhoto).mockResolvedValueOnce({ liked: true, likesCount: 1, created: false });
    const like = vi.spyOn(analytics, 'photoLike');
    render(<PhotoCard photo={photo} index={0} onClick={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '喜欢 树影' }));
    await act(async () => {});
    expect(like).not.toHaveBeenCalled();
  });

  it('reports qualified views, successful shares, lightbox navigation, details, and close methods', async () => {
    vi.useFakeTimers();
    const photoView = vi.spyOn(analytics, 'photoView');
    const share = vi.spyOn(analytics, 'share');
    const navigate = vi.spyOn(analytics, 'lightboxNavigate');
    const details = vi.spyOn(analytics, 'photoDetails');
    const close = vi.spyOn(analytics, 'lightboxClose');
    render(<Lightbox photo={photo} analyticsSource="album" albumId="album-one" hasPrev={false} hasNext onPrev={vi.fn()} onNext={vi.fn()} onClose={vi.fn()} onShare={vi.fn().mockResolvedValue('copied')} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(photoView).toHaveBeenCalledWith(photo.id, 'album', 'album-one');

    fireEvent.click(screen.getByRole('button', { name: `分享作品：${photo.title}` }));
    await act(async () => {});
    expect(share).toHaveBeenCalledWith(photo.id, 'clipboard');
    fireEvent.click(screen.getByRole('button', { name: '下一幅作品' }));
    expect(navigate).toHaveBeenCalledWith(photo.id, 'next', 'button');
    fireEvent.click(screen.getByRole('button', { name: '作品信息' }));
    expect(details).toHaveBeenCalledWith(photo.id, true);
    fireEvent.click(screen.getByRole('button', { name: '关闭大图' }));
    expect(close).toHaveBeenCalledWith(photo.id, 'button');
  });
});
