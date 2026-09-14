// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { likeService } from './likeService';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('like service result semantics', () => {
  it('marks an ALREADY_LIKED response as not newly created', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: false,
        code: 'ALREADY_LIKED',
        data: { liked: true, likesCount: 8 },
      }),
    }));

    const result = await likeService.likePhoto('already-liked-photo', 0);

    expect(result).toEqual({ liked: true, likesCount: 8, created: false });
  });

  it('marks a successful new like as created', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { liked: true, likesCount: 9 },
      }),
    }));

    const result = await likeService.likePhoto('newly-liked-photo', 0);

    expect(result).toEqual({ liked: true, likesCount: 9, created: true });
  });
});
