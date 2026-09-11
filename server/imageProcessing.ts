import sharp from 'sharp';
import { Worker } from 'node:worker_threads';

export const DISPLAY_MAX_EDGE = 2560;
export const THUMBNAIL_MAX_EDGE = 720;
export const MAX_INPUT_PIXELS = 80_000_000;

export interface ProcessedImages {
  display: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
}

function decodeHeic(buffer: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(`
      const { parentPort } = require('node:worker_threads');
      const decode = require('heic-decode');
      parentPort.once('message', async input => {
        try {
          const result = await decode({ buffer: Buffer.from(input) });
          const data = Buffer.from(result.data);
          parentPort.postMessage({ data, width: result.width, height: result.height }, [data.buffer]);
        } catch (error) {
          parentPort.postMessage({ error: error instanceof Error ? error.message : String(error) });
        }
      });
    `, { eval: true });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('HEIC 解码超时'));
    }, 30_000);
    worker.once('message', result => {
      clearTimeout(timer);
      void worker.terminate();
      if (result.error) reject(new Error(`HEIC 解码失败：${result.error}`));
      else resolve({ ...result, data: Buffer.from(result.data) });
    });
    worker.once('error', error => { clearTimeout(timer); reject(error); });
    worker.postMessage(buffer);
  });
}

function isHeic(mime: string, name: string) {
  return ['image/heic', 'image/heif'].includes(mime) || /\.(heic|heif)$/i.test(name);
}

export async function processUploadedImage(file: Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'originalname'>): Promise<ProcessedImages> {
  let source: sharp.Sharp;
  if (isHeic(file.mimetype, file.originalname)) {
    const decoded = await decodeHeic(file.buffer);
    if (decoded.width * decoded.height > MAX_INPUT_PIXELS) throw new Error('图片像素超过 8000 万限制');
    source = sharp(decoded.data, { raw: { width: decoded.width, height: decoded.height, channels: 4 }, limitInputPixels: MAX_INPUT_PIXELS });
  } else {
    source = sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS, animated: false });
    const metadata = await source.metadata();
    if (!metadata.width || !metadata.height) throw new Error('无法读取图片尺寸');
    if (metadata.width * metadata.height > MAX_INPUT_PIXELS) throw new Error('图片像素超过 8000 万限制');
  }

  const normalized = source.rotate().toColourspace('srgb');
  const displayResult = await normalized.clone()
    .resize({ width: DISPLAY_MAX_EDGE, height: DISPLAY_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, effort: 4, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });
  const thumbnail = await normalized.clone()
    .resize({ width: THUMBNAIL_MAX_EDGE, height: THUMBNAIL_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 74, effort: 4, smartSubsample: true })
    .toBuffer();

  return {
    display: displayResult.data,
    thumbnail,
    width: displayResult.info.width,
    height: displayResult.info.height,
  };
}

/** Prepare a compact, orientation-corrected image for a vision model request. */
export async function prepareImageForVision(file: Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'originalname'>): Promise<Buffer> {
  let source: sharp.Sharp;
  if (isHeic(file.mimetype, file.originalname)) {
    const decoded = await decodeHeic(file.buffer);
    source = sharp(decoded.data, { raw: { width: decoded.width, height: decoded.height, channels: 4 }, limitInputPixels: MAX_INPUT_PIXELS });
  } else {
    source = sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS, animated: false });
  }
  return source.rotate().toColourspace('srgb')
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}
