import exifr from 'exifr';
import type { ExifData } from './types';

const EXIF_FIELDS = [
  'Make',
  'Model',
  'LensModel',
  'FNumber',
  'ExposureTime',
  'ISO',
  'DateTimeOriginal',
  'Artist',
  'Author',
  'Copyright',
  'City',
  'State',
  'Province',
  'Country',
] as const;

interface RawExifData {
  Make?: string;
  Model?: string;
  LensModel?: string;
  FNumber?: number;
  ExposureTime?: number;
  ISO?: number;
  DateTimeOriginal?: Date | string | number;
  Artist?: string;
  Author?: string;
  Copyright?: string;
  City?: string;
  State?: string;
  Province?: string;
  Country?: string;
}

export interface ParsedPhotoExif {
  exif: ExifData;
  year?: number;
}

export function formatExifData(exif: RawExifData | null | undefined): ParsedPhotoExif {
  if (!exif) return { exif: {} };

  const formatted: ExifData = {
    make: exif.Make || '',
    model: exif.Model || '',
    camera: exif.Make && exif.Model
      ? `${exif.Make} ${exif.Model}`.trim()
      : exif.Make || exif.Model || '',
    lens: exif.LensModel || '',
    aperture: exif.FNumber ? `f/${exif.FNumber.toFixed(1)}` : '',
    shutterSpeed: exif.ExposureTime
      ? exif.ExposureTime >= 1
        ? `${exif.ExposureTime.toFixed(0)}s`
        : `1/${Math.round(1 / exif.ExposureTime)}s`
      : '',
    iso: exif.ISO ? `ISO ${exif.ISO}` : '',
    fNumber: exif.FNumber,
    exposureTime: exif.ExposureTime,
    isoSpeedRatings: exif.ISO,
    lensModel: exif.LensModel,
    author: exif.Author || exif.Artist || '',
    copyright: exif.Copyright || '',
    city: exif.City || '',
    province: exif.State || exif.Province || '',
    country: exif.Country || '',
  };

  if (!exif.DateTimeOriginal) return { exif: formatted };

  const date = new Date(exif.DateTimeOriginal);
  return isNaN(date.getTime())
    ? { exif: formatted }
    : { exif: formatted, year: date.getFullYear() };
}

export async function parsePhotoExif(file: File): Promise<ParsedPhotoExif> {
  try {
    const exif = await exifr.parse(file, { pick: [...EXIF_FIELDS] });
    return formatExifData(exif as RawExifData | null | undefined);
  } catch (error) {
    console.error('解析 EXIF 数据失败:', error);
    return { exif: {} };
  }
}
