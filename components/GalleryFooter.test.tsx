// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GalleryFooter } from './GalleryFooter';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('GalleryFooter', () => {
  it('keeps the Hwangzhun copyright with the current year and no personal link', () => {
    const { container } = render(<GalleryFooter />);

    expect(screen.getByText(`© ${new Date().getFullYear()} Hwangzhun. All rights reserved.`)).toBeInTheDocument();
    expect(container.querySelector('a[href*="hwangzhun"]')).not.toBeInTheDocument();
  });

  it('respects reduced-motion preferences when returning to the top', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    render(<GalleryFooter />);

    fireEvent.click(screen.getByRole('button', { name: '回到开始' }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });

  it('uses smooth scrolling when reduced motion is not requested', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    render(<GalleryFooter />);

    fireEvent.click(screen.getByRole('button', { name: '回到开始' }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});
