// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GalleryFilters } from './GalleryFilters';

vi.mock('../api/tagService', () => ({ tagService: {
  getAllTagNames: vi.fn().mockResolvedValue(['街巷', '人物', '建筑', '夜色']),
  getAvailableYears: vi.fn().mockResolvedValue([2026]),
} }));

afterEach(() => cleanup());

describe('gallery tag rail', () => {
  it('keeps the all-work filter outside the scrolling tag rail', async () => {
    const { container } = render(<GalleryFilters filter={{ year: null, tag: null }} onFilterChange={vi.fn()} compact={false} onCompactChange={vi.fn()} />);
    await act(async () => {});
    const all = screen.getByRole('button', { name: '全部作品' });
    const scroller = container.querySelector('.gallery-filter-scroll')!;
    expect(scroller).not.toContainElement(all);
    expect(all.nextElementSibling).toBe(scroller);
    expect(scroller).toHaveTextContent('街巷');
  });

  it('turns a vertical wheel gesture into horizontal movement without trapping the page at either end', async () => {
    const { container } = render(<GalleryFilters filter={{ year: null, tag: null }} onFilterChange={vi.fn()} compact={false} onCompactChange={vi.fn()} />);
    await act(async () => {});
    const scroller = container.querySelector('.gallery-filter-scroll') as HTMLDivElement;
    Object.defineProperties(scroller, {
      clientWidth: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 400 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    });

    const forward = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 60 });
    scroller.dispatchEvent(forward);
    expect(scroller.scrollLeft).toBe(60);
    expect(forward.defaultPrevented).toBe(true);

    scroller.scrollLeft = 300;
    const atEnd = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 60 });
    scroller.dispatchEvent(atEnd);
    expect(scroller.scrollLeft).toBe(300);
    expect(atEnd.defaultPrevented).toBe(false);
  });

  it('still selects a tag with a normal click', async () => {
    const onFilterChange = vi.fn();
    render(<GalleryFilters filter={{ year: null, tag: null }} onFilterChange={onFilterChange} compact={false} onCompactChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '建筑' }));
    expect(onFilterChange).toHaveBeenCalledWith({ tag: '建筑' });
  });

  it('drags the rail horizontally and does not select the tag under the release point', async () => {
    vi.useFakeTimers();
    const onFilterChange = vi.fn();
    const { container } = render(<GalleryFilters filter={{ year: null, tag: null }} onFilterChange={onFilterChange} compact={false} onCompactChange={vi.fn()} />);
    await act(async () => {});
    const scroller = container.querySelector('.gallery-filter-scroll') as HTMLDivElement;
    Object.defineProperties(scroller, {
      clientWidth: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 400 },
      scrollLeft: { configurable: true, writable: true, value: 80 },
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn().mockReturnValue(true) },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });

    fireEvent.pointerDown(scroller, { button: 0, pointerId: 7, clientX: 120 });
    fireEvent.pointerMove(scroller, { pointerId: 7, clientX: 70 });
    expect(scroller.scrollLeft).toBe(130);
    expect(scroller).toHaveClass('is-dragging');
    fireEvent.pointerUp(scroller, { pointerId: 7, clientX: 70 });
    fireEvent.click(screen.getByRole('button', { name: '街巷' }));
    expect(onFilterChange).not.toHaveBeenCalled();
    expect(scroller).not.toHaveClass('is-dragging');
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });
});
