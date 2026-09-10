import { describe, expect, it } from 'vitest';
import { dbPhotoToPhoto } from './utils';

describe('dbPhotoToPhoto', () => {
  it('maps database fields and optional EXIF to the public photo contract', () => {
    const photo = dbPhotoToPhoto({ id: '1', url: 'full.jpg', thumbnail_url: 'thumb.jpg', title: 'Night', description: null, year: 2026, width: 1200, height: 800, exif: '{"city":"Hong Kong"}', likes_count: 8, views_count: 21, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', tags: ['night'] });
    expect(photo).toMatchObject({ thumbnailUrl: 'thumb.jpg', createdAt: '2026-01-01T00:00:00.000Z', tags: ['night'], likesCount: 8, viewsCount: 21, exif: { city: 'Hong Kong' } });
  });
});
