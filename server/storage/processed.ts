import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { deleteFile } from './index';
import { getOSSClient, generateFilePath, putOSSFile } from './oss';
import { loadStorageConfig } from './config';

export interface StoredProcessedImages {
  url: string;
  thumbnailUrl: string;
  objectKey: string;
  thumbnailObjectKey: string;
}

function localPath(prefix: 'photos' | 'thumbs') {
  const date = new Date();
  return `${prefix}/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${uuidv4()}.avif`;
}

export async function storeProcessedImages(display: Buffer, thumbnail: Buffer): Promise<StoredProcessedImages> {
  const config = await loadStorageConfig();
  let url = '';
  let thumbnailUrl = '';
  let objectKey = '';
  let thumbnailObjectKey = '';
  const localFiles: string[] = [];
  try {
    if (config.mode === 'local' && config.local) {
      const root = isAbsolute(config.local.uploadDir) ? config.local.uploadDir : join(process.cwd(), config.local.uploadDir.replace(/^\.\//, ''));
      const displayPath = localPath('photos');
      const thumbnailPath = localPath('thumbs');
      objectKey = displayPath;
      thumbnailObjectKey = thumbnailPath;
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
      const displayPath = generateFilePath('image.avif', 'photos', config.oss.uploadDir);
      const thumbnailPath = generateFilePath('image.avif', 'thumbs', config.oss.uploadDir);
      const storedDisplay = await putOSSFile(client, displayPath, display, { mime: 'image/avif' });
      objectKey = storedDisplay.objectKey;
      url = storedDisplay.url;
      const storedThumbnail = await putOSSFile(client, thumbnailPath, thumbnail, { mime: 'image/avif' });
      thumbnailObjectKey = storedThumbnail.objectKey;
      thumbnailUrl = storedThumbnail.url;
    } else {
      throw new Error('存储配置不完整');
    }
    return { url, thumbnailUrl, objectKey, thumbnailObjectKey };
  } catch (error) {
    await Promise.allSettled(localFiles.length
      ? localFiles.map(file => unlink(file))
      : [url ? deleteFile(url) : Promise.resolve(), thumbnailUrl ? deleteFile(thumbnailUrl) : Promise.resolve()]);
    throw error;
  }
}
