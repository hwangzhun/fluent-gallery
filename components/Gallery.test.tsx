// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MasonryGallery } from './MasonryGallery';
import { Lightbox } from './Lightbox';
import { likeService, viewService } from '../api';
import type { Photo } from '../types';

vi.mock('../api', () => ({
  likeService: {
    isLiked: vi.fn().mockReturnValue(false),
    getLikeStatus: vi.fn().mockResolvedValue({ liked: false, likesCount: 0 }),
    likePhoto: vi.fn().mockResolvedValue({ liked: true, likesCount: 1, created: true }),
  },
  viewService: {
    getViewStatus: vi.fn().mockResolvedValue({ viewsCount: 0 }),
    recordView: vi.fn().mockResolvedValue({ viewsCount: 1 }),
  },
}));
vi.mock('../api/tagService', () => ({
  tagService: {
    getAllTagNames: vi.fn().mockResolvedValue(['街巷']),
    getAvailableYears: vi.fn().mockResolvedValue([2026, 2025]),
  },
}));

const first: Photo = { id: 'one', title: '树影', url: '/one.jpg', thumbnailUrl: '/one-small.jpg', width: 1200, height: 800, year: 2026, tags: ['街巷'], createdAt: '2026-01-01', likesCount: 0, viewsCount: 0 };
const second: Photo = { ...first, id: 'two', title: '街角', url: '/two.jpg', thumbnailUrl: '/two-small.jpg', year: 2025 };
const galleryProps = { photos: [first, second], loading: false, error: null, filter: { year: null, tag: null }, gallerySettings: { randomizePhotos: false, heroPhotoId: null, heroImageFit: 'contain' as const, heroAspectRatio: '4:3' as const, heroImagePositionX: 50, heroImagePositionY: 50, heroImageScale: 1, heroImagePositionPhotoId: null }, onFilterChange: vi.fn(), onRetry: vi.fn() };

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
  it('keeps the current masonry layout mounted while a new filter is loading', () => {
    const { container } = render(<MasonryGallery {...galleryProps} loading />);
    expect(screen.getByRole('button', { name: '查看作品：树影' })).toBeInTheDocument();
    expect(container.querySelector('.gallery-results')).toHaveClass('is-updating');
    expect(container.querySelector('.gallery-skeleton')).not.toBeInTheDocument();
  });

  it('presents Fluent as a journal of moments in motion', () => {
    render(<MasonryGallery {...galleryProps} />);
    expect(screen.getByRole('heading', { name: '让光影，继续流动。' })).toBeInTheDocument();
    expect(screen.getByText('Images in motion.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Fluent 收集那些自然发生、稍纵即逝的片刻——', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '循光而行' })).toBeInTheDocument();
  });

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
    render(<MasonryGallery {...galleryProps} photos={[first, portrait]} gallerySettings={{ randomizePhotos: false, heroPhotoId: portrait.id, heroImageFit: 'cover', heroAspectRatio: 'xpan', heroImagePositionX: 25, heroImagePositionY: 70, heroImageScale: 1.5, heroImagePositionPhotoId: portrait.id }} />);
    await act(async () => {});
    const hero = screen.getByRole('button', { name: '查看封面作品：竖幅封面' });
    expect(hero).toHaveClass('is-cover');
    expect(hero.style.getPropertyValue('--hero-position-x')).toBe('25%');
    expect(hero.style.getPropertyValue('--hero-position-y')).toBe('70%');
    expect(hero.style.getPropertyValue('--hero-image-scale')).toBe('1.5');
    expect(hero.closest('.gallery-hero-art')).toHaveStyle({ '--hero-frame-ratio': '65 / 24' });
  });

  it('centers a Hero crop saved for a different photo', async () => {
    render(<MasonryGallery {...galleryProps} gallerySettings={{ ...galleryProps.gallerySettings, heroImageFit: 'cover', heroImagePositionX: 10, heroImagePositionY: 90, heroImagePositionPhotoId: second.id }} />);
    await act(async () => {});
    const hero = screen.getByRole('button', { name: '查看封面作品：树影' });
    expect(hero.style.getPropertyValue('--hero-position-x')).toBe('50%');
    expect(hero.style.getPropertyValue('--hero-position-y')).toBe('50%');
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

  it('shares the current lightbox photo with a stable deep link', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    render(<MasonryGallery {...galleryProps} />);
    fireEvent.click(screen.getByRole('button', { name: '查看作品：树影' }));
    fireEvent.click(await screen.findByRole('button', { name: '分享作品：树影' }));
    await act(async () => {});
    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      title: '树影',
      url: expect.stringContaining('#/?photo=one'),
    }));
    expect(screen.getByText('已打开分享')).toBeInTheDocument();
  });

  it('copies the deep link when native sharing is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<MasonryGallery {...galleryProps} />);
    fireEvent.click(screen.getByRole('button', { name: '查看作品：树影' }));
    fireEvent.click(await screen.findByRole('button', { name: '分享作品：树影' }));
    await act(async () => {});
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('#/?photo=one'));
    expect(screen.getByText('链接已复制')).toBeInTheDocument();
  });

  it('opens a shared photo outside the loaded collection and clears the link on close', async () => {
    const onLightboxClose = vi.fn();
    render(<MasonryGallery {...galleryProps} sharedPhoto={{ ...first, id: 'outside', title: '远方的光' }} onLightboxClose={onLightboxClose} />);
    expect(await screen.findByRole('dialog', { name: '作品：远方的光' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上一幅作品' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一幅作品' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '关闭大图' }));
    expect(onLightboxClose).toHaveBeenCalledOnce();
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


it('defaults to compact on mobile while keeping the visitor’s manual choice', async () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
  const { container, rerender } = render(<MasonryGallery {...galleryProps} />);
  expect(screen.getByRole('button', { name: '紧凑布局' })).toHaveAttribute('aria-pressed', 'true');
  expect(container.querySelector('.gallery-grid')).toHaveClass('is-compact');
  fireEvent.click(screen.getByRole('button', { name: '舒展布局' }));
  rerender(<MasonryGallery {...galleryProps} photos={[second]} />);
  expect(container.querySelector('.gallery-grid')).not.toHaveClass('is-compact');
  vi.unstubAllGlobals();
});

it('uses the selected candidate’s own settings outside the loaded photo page', async () => {
  const { container } = render(<MasonryGallery {...galleryProps} photos={[first]} configuredHero={second} gallerySettings={{ ...galleryProps.gallerySettings, heroImages: [
    { photoId: first.id, fit: 'contain', aspectRatio: '4:3', positionX: 50, positionY: 50, scale: 1 },
    { photoId: second.id, fit: 'cover', aspectRatio: '2.35:1', positionX: 30, positionY: 70, scale: 2 },
  ] }} />);
  const hero = screen.getByRole('button', { name: '查看封面作品：街角' });
  expect(hero.style.getPropertyValue('--hero-image-scale')).toBe('2');
  expect(container.querySelector('.gallery-hero-art')).toHaveStyle({ '--hero-frame-ratio': '2.35 / 1' });
  fireEvent.click(hero);
  expect(screen.getByRole('dialog', { name: '作品：街角' })).toBeInTheDocument();
  await act(async () => {});
});

it('shows stats above the title, allows retrying likes, and does not recount when opening details', async () => {
  vi.useFakeTimers();
  vi.mocked(likeService.likePhoto).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ liked: true, likesCount: 1, created: true });
  const { container } = render(<Lightbox photo={first} albumName="测试画册" onClose={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} hasNext={false} hasPrev={false} />);
  await act(async () => {});
  const stats = container.querySelector('.lightbox-stats')!;
  expect(stats.nextElementSibling?.tagName).toBe('H2');
  expect(container.querySelector('.lightbox-details .lightbox-stats')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '喜欢这幅作品' }));
  await act(async () => {});
  expect(screen.getByRole('status')).toHaveTextContent('暂时无法点赞');
  fireEvent.click(screen.getByRole('button', { name: '喜欢这幅作品' }));
  await act(async () => {});
  expect(screen.getByRole('button', { name: '已喜欢这幅作品' })).toBeDisabled();
  expect(likeService.likePhoto).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  fireEvent.click(screen.getByRole('button', { name: '作品信息' }));
  fireEvent.click(screen.getByRole('button', { name: '作品信息' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(viewService.recordView).toHaveBeenCalledExactlyOnceWith(first.id);
});
