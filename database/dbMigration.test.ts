import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sqlite3 from 'sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const directory = mkdtempSync(join(tmpdir(), 'fluent-gallery-migration-'));
const databasePath = join(directory, 'legacy.db');
process.env.GALLERY_DB_PATH = databasePath;

function createLegacyDatabase() {
  return new Promise<void>((resolve, reject) => {
    const database = new sqlite3.Database(databasePath);
    database.exec(`
      CREATE TABLE photos (
        id TEXT PRIMARY KEY, url TEXT NOT NULL, thumbnail_url TEXT NOT NULL, title TEXT NOT NULL,
        description TEXT, year INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
        exif TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
      CREATE TABLE photo_tags (
        photo_id TEXT NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY (photo_id, tag_id),
        FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );
      INSERT INTO photos VALUES ('legacy-photo', '/legacy.webp', '/legacy-thumb.webp', 'Legacy', NULL, 2020, 800, 600, NULL, '2020-01-01', '2020-01-01');
    `, error => {
      if (error) { database.close(); reject(error); return; }
      database.close(closeError => closeError ? reject(closeError) : resolve());
    });
  });
}

let databaseModule: typeof import('./db');

beforeAll(async () => {
  await createLegacyDatabase();
  databaseModule = await import('./db');
  await databaseModule.initDatabase();
});

afterAll(async () => { await databaseModule.closeDatabase(); rmSync(directory, { recursive: true, force: true }); });

describe('database interaction-count migration', () => {
  it('adds cached counters and ranking indexes without losing legacy photos', async () => {
    const photo = await databaseModule.dbGet<{ id: string; likes_count: number; views_count: number }>("SELECT id, likes_count, views_count FROM photos WHERE id = 'legacy-photo'");
    const indexes = await databaseModule.dbAll<{ name: string }>('PRAGMA index_list(photos)');
    expect(photo).toEqual({ id: 'legacy-photo', likes_count: 0, views_count: 0 });
    expect(indexes.map(index => index.name)).toEqual(expect.arrayContaining(['idx_photos_likes_count', 'idx_photos_views_count']));
  });
});

it('adds album tables idempotently without altering existing photos or memberships', async () => {
  await databaseModule.dbRun("INSERT INTO albums(id, name) VALUES ('legacy-album', '迁移画册')");
  await databaseModule.dbRun("INSERT INTO album_photos(album_id, photo_id, position) VALUES ('legacy-album', 'legacy-photo', 0)");
  await databaseModule.initDatabase();
  await databaseModule.initDatabase();
  expect(await databaseModule.dbGet("SELECT name FROM albums WHERE id = 'legacy-album'")).toEqual({ name: '迁移画册' });
  expect(await databaseModule.dbGet("SELECT photo_id FROM album_photos WHERE album_id = 'legacy-album'")).toEqual({ photo_id: 'legacy-photo' });
  expect(await databaseModule.dbGet("SELECT title FROM photos WHERE id = 'legacy-photo'")).toEqual({ title: 'Legacy' });
});
