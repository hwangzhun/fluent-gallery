import { describe, expect, it } from 'vitest';
import { deriveStorageKey } from './storageKey';

describe('deriveStorageKey', () => {
  it('extracts an OSS key independently of domain and query parameters', () => {
    expect(deriveStorageKey('https://media.example.com/fluent_gallery/photos/2026/09/a.avif?version=1'))
      .toBe('fluent_gallery/photos/2026/09/a.avif');
  });

  it('normalizes legacy local upload URLs', () => {
    expect(deriveStorageKey('http://localhost:3001/uploads/photos/2026/09/a.avif'))
      .toBe('photos/2026/09/a.avif');
  });

  it('decodes URL-encoded key segments', () => {
    expect(deriveStorageKey('https://media.example.com/photos/%E4%BD%9C%E5%93%81.avif'))
      .toBe('photos/作品.avif');
  });
});
