// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Photo } from '../../types';
import { HeroCropPreview } from './HeroCropPreview';

const landscape: Photo = { id: 'hero', title: '横幅', url: '/hero.jpg', thumbnailUrl: '/hero-small.jpg', width: 1600, height: 900, year: 2026, tags: [], createdAt: '2026-01-01', likesCount: 0, viewsCount: 0 };

afterEach(cleanup);

describe('HeroCropPreview', () => {
  it('converts a natural image drag into a bounded crop position', () => {
    const onViewChange = vi.fn();
    const { container } = render(<HeroCropPreview photo={landscape} fit="cover" aspectRatio="4:3" positionX={50} positionY={50} scale={1} onViewChange={onViewChange} onReset={vi.fn()} />);
    const frame = screen.getByRole('group', { name: '调整 Hero 图片《横幅》的显示区域' });
    vi.spyOn(container.querySelector('.artwork-image')!, 'getBoundingClientRect').mockReturnValue({ width: 400, height: 300, top: 0, right: 400, bottom: 300, left: 0, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 300, clientY: 100 });
    fireEvent.pointerUp(frame, { pointerId: 1 });
    expect(onViewChange).toHaveBeenLastCalledWith(0, 50, 1);
  });

  it('supports wheel and keyboard zoom plus restoring the center', () => {
    const onViewChange = vi.fn();
    const onReset = vi.fn();
    render(<HeroCropPreview photo={landscape} fit="cover" aspectRatio="4:3" positionX={40} positionY={50} scale={1} onViewChange={onViewChange} onReset={onReset} />);
    const frame = screen.getByRole('group');
    const wheel = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    fireEvent(frame, wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(onViewChange.mock.calls[0][2]).toBeGreaterThan(1);
    fireEvent.keyDown(frame, { key: '+' });
    expect(onViewChange.mock.calls[1][2]).toBeGreaterThan(onViewChange.mock.calls[0][2]);
    fireEvent.click(screen.getByRole('button', { name: '恢复居中' }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('uses two touch pointers to pinch zoom', () => {
    const onViewChange = vi.fn();
    render(<HeroCropPreview photo={landscape} fit="cover" aspectRatio="xpan" positionX={50} positionY={50} scale={1} onViewChange={onViewChange} onReset={vi.fn()} />);
    const frame = screen.getByRole('group');
    fireEvent.pointerDown(frame, { pointerId: 1, pointerType: 'touch', clientX: 0, clientY: 0 });
    fireEvent.pointerDown(frame, { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 0 });
    fireEvent.pointerMove(frame, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 0 });
    expect(onViewChange).toHaveBeenLastCalledWith(50, 50, 2);
  });

  it('keeps contain mode centered and non-draggable', () => {
    const onViewChange = vi.fn();
    const { container } = render(<HeroCropPreview photo={landscape} fit="contain" aspectRatio="4:3" positionX={20} positionY={80} scale={2} onViewChange={onViewChange} onReset={vi.fn()} />);
    const frame = container.querySelector<HTMLElement>('.gallery-featured-frame')!;
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.wheel(frame, { deltaY: -100 });
    expect(onViewChange).not.toHaveBeenCalled();
    expect(frame.style.getPropertyValue('--hero-position-x')).toBe('50%');
    expect(frame.style.getPropertyValue('--hero-position-y')).toBe('50%');
    expect(frame.style.getPropertyValue('--hero-image-scale')).toBe('1');
    expect(screen.queryByRole('button', { name: '恢复居中' })).not.toBeInTheDocument();
  });
});
