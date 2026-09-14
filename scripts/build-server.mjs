import { copyFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';

const outputDirectory = 'dist-server';

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

await Promise.all([
  build({
    entryPoints: ['server/index.ts'],
    outfile: join(outputDirectory, 'index.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    minify: true,
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    external: ['sharp', 'sqlite3', 'proxy-agent'],
  }),
  build({
    entryPoints: ['server/heicWorker.cjs'],
    outfile: join(outputDirectory, 'heicWorker.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    minify: true,
  }),
  copyFile('database/schema.sql', join(outputDirectory, 'schema.sql')),
  copyFile('database/albums.sql', join(outputDirectory, 'albums.sql')),
]);
