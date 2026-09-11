// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { Photo } from './types';

const mocks = vi.hoisted(() => ({
  getPhotoById: vi.fn(),
  getPublicPhotoPage: vi.fn(),
}));

vi.mock('./services/photoService', () => ({
  photoService: {
    getPhotoById: mocks.getPhotoById,
    getPublicPhotoPage: mocks.getPublicPhotoPage,
  },
}));
vi.mock('./services/settingsService', () => ({
  settingsService: {
    getGallerySettings: vi.fn().mockResolvedValue({ randomizePhotos: false, heroPhotoId: null, heroImageFit: 'contain' }),
    getSeoSettings: vi.fn().mockResolvedValue({ title: 'Fluent Gallery', description: '', keywords: '', author: '', canonicalUrl: '', ogTitle: '', ogDescription: '', ogImage: '' }),
  },
}));
vi.mock('./services/tagService', () => ({
  tagService: { getAllTagNames: vi.fn().mockResolvedValue([]), getAvailableYears: vi.fn().mockResolvedValue([]) },
}));
vi.mock('./services', () => ({
  likeService: { isLiked: vi.fn().mockReturnValue(false), getLikeStatus: vi.fn().mockResolvedValue({ liked: false, likesCount: 0 }), likePhoto: vi.fn() },
  viewService: { getViewStatus: vi.fn().mockResolvedValue({ viewsCount: 0 }), recordView: vi.fn().mockResolvedValue({ viewsCount: 1 }) },
}));

const first: Photo = { id: 'first', title: '首页作品', url: '/first.jpg', thumbnailUrl: '/first-small.jpg', width: 1200, height: 800, year: 2026, tags: [], createdAt: '', likesCount: 0, viewsCount: 0 };
const outside: Photo = { ...first, id: 'outside', title: '分享的远方' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPublicPhotoPage.mockResolvedValue({ items: [first], total: 1, hasMore: false, nextCursor: null });
  mocks.getPhotoById.mockResolvedValue(outside);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function () { this.setAttribute('open', ''); } },
    close: { configurable: true, value: function () { this.removeAttribute('open'); } },
  });
});

afterEach(() => {
  cleanup();
  window.location.hash = '';
  document.body.style.overflow = '';
});

describe('shared photo links', () => {
  it('fetches and opens a photo outside the initial homepage page', async () => {
    window.location.hash = '#/?photo=outside';
    render(<App />);
    expect(await screen.findByRole('dialog', { name: '作品：分享的远方' })).toBeInTheDocument();
    expect(mocks.getPhotoById).toHaveBeenCalledWith('outside');
    fireEvent.click(screen.getByRole('button', { name: '关闭大图' }));
    await waitFor(() => expect(window.location.hash).toBe('#/'));
  });

  it('returns to the gallery with a notice when the shared photo is unavailable', async () => {
    mocks.getPhotoById.mockRejectedValueOnce(new Error('照片不存在'));
    window.location.hash = '#/?photo=missing';
    render(<App />);
    expect(await screen.findByText('这幅作品已不可用，已为你返回画廊。')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe('#/'));
  });
});
