// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Photo } from '../../types';
import { HeroPhotoPicker } from './HeroPhotoPicker';

const first: Photo = { id: 'one', title: '树影', url: '/one.jpg', thumbnailUrl: '/one-small.jpg', width: 1200, height: 800, year: 2026, tags: ['自然'], createdAt: '2026-01-01', likesCount: 0, viewsCount: 0 };
const second: Photo = { ...first, id: 'two', title: '街角', url: '/two.jpg', thumbnailUrl: '/two-small.jpg', year: 2025, tags: ['城市'] };

afterEach(() => { cleanup(); document.body.style.overflow = ''; });

describe('HeroPhotoPicker', () => {
  it('searches visually and confirms the selected photo', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<HeroPhotoPicker open photos={[first, second]} selectedId={null} onClose={onClose} onConfirm={onConfirm} />);
    expect(screen.getByRole('dialog', { name: '选择 Hero 封面图片' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: '搜索 Hero 候选图片' }), { target: { value: '2025' } });
    expect(screen.getByRole('radio', { name: /街角/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /树影/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /街角/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认选择' }));
    expect(onConfirm).toHaveBeenCalledWith('two');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('supports automatic selection and restores page scrolling when closed', () => {
    const onClose = vi.fn();
    const { rerender } = render(<HeroPhotoPicker open photos={[first]} selectedId={first.id} onClose={onClose} onConfirm={vi.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('radio', { name: /自动选择/ }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    rerender(<HeroPhotoPicker open={false} photos={[first]} selectedId={first.id} onClose={onClose} onConfirm={vi.fn()} />);
    expect(document.body.style.overflow).toBe('');
  });
});
