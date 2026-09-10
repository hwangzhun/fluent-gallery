import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { deleteFile } from './index';
import { getOSSClient, generateFilePath, putOSSFile } from './oss';
import { loadStorageConfig } from './config';

export interface StoredProcessedImages { url: string; thumbnailUrl: string }

function localPath(prefix: 'photos' | 'thumbs') {
  const date = new Date();
  return `${prefix}/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${uuidv4()}.webp`;
}

export async function storeProcessedImages(display: Buffer, thumbnail: Buffer): Promise<StoredProcessedImages> {
  const config = await loadStorageConfig();
  let url = '';
  let thumbnailUrl = '';
  const localFiles: string[] = [];
  try {
    if (config.mode === 'local' && config.local) {
      const root = isAbsolute(config.local.uploadDir) ? config.local.uploadDir : join(process.cwd(), config.local.uploadDir.replace(/^\.\//, ''));
      const displayPath = localPath('photos');
      const thumbnailPath = localPath('thumbs');
      await Promise.all([mkdir(dirname(join(root, displayPath)), { recursive: true }), mkdir(dirname(join(root, thumbnailPath)), { recursive: true })]);
      const displayFile = join(root, displayPath);
      const thumbnailFile = join(root, thumbnailPath);
      await writeFile(displayFile, display);
      localFiles.push(displayFile);
      url = `${config.local.publicUrl}/${displayPath}`;
      await writeFile(thumbnailFile, thumbnail);
      localFiles.push(thumbnailFile);
      thumbnailUrl = `${config.local.publicUrl}/${thumbnailPath}`;
    } else if (config.mode === 'oss' && config.oss) {
      const client = await getOSSClient();
      const displayPath = generateFilePath('image.webp', 'photos');
      const thumbnailPath = generateFilePath('image.webp', 'thumbs');
      url = (await putOSSFile(client, displayPath, display, { mime: 'image/webp' })).url;
      thumbnailUrl = (await putOSSFile(client, thumbnailPath, thumbnail, { mime: 'image/webp' })).url;
    } else {
      throw new Error('存储配置不完整');
    }
    return { url, thumbnailUrl };
  } catch (error) {
    await Promise.allSettled(localFiles.length
      ? localFiles.map(file => unlink(file))
      : [url ? deleteFile(url) : Promise.resolve(), thumbnailUrl ? deleteFile(thumbnailUrl) : Promise.resolve()]);
    throw error;
  }
}
