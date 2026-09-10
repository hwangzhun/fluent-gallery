import type { BatchFieldKey, ExifData, PhotoFormData } from './types';

export const MAX_BATCH_FILES = 20;
export const UPLOAD_CONCURRENCY = 2;

export function getFileKey(file: File): string {
  return [file.name, file.size, file.type, file.lastModified].join(':');
}

export function getPhotoTitle(file: File): string {
  return file.name.split('.')[0];
}

export function updatePhotoFormField(
  data: PhotoFormData,
  field: BatchFieldKey,
  value: string | number,
): PhotoFormData {
  if (!field.startsWith('exif.')) {
    return { ...data, [field]: value };
  }

  const exifField = field.slice(5) as keyof ExifData;
  return { ...data, exif: { ...data.exif, [exifField]: value } };
}

export function isPhotoFormValid(data: PhotoFormData): boolean {
  return Boolean(data.title.trim()) && Number.isFinite(data.year) && data.year > 0;
}

export async function runWithConcurrency<T>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), values.length);

  const worker = async () => {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await task(values[currentIndex]);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, worker));
}
