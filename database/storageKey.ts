/**
 * Derive a storage-relative key from legacy URL-only records.
 * New uploads should persist the exact generated key instead of relying on this.
 */
export function deriveStorageKey(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  let pathname = raw;
  try {
    pathname = new URL(raw).pathname;
  } catch {
    pathname = raw.split(/[?#]/, 1)[0];
  }

  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // Keep the encoded pathname when it contains malformed escape sequences.
  }

  let key = pathname.replace(/^\/+/, '');
  // Local public URLs are normally /uploads/<relative path>.
  if (key.startsWith('uploads/')) key = key.slice('uploads/'.length);
  return key || null;
}
