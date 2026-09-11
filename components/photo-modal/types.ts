import type { Photo } from '../../types';

export interface ExifData {
  camera?: string;
  lens?: string;
  aperture?: string;
  shutterSpeed?: string;
  iso?: string;
  make?: string;
  model?: string;
  fNumber?: number;
  exposureTime?: number;
  isoSpeedRatings?: number;
  lensModel?: string;
  author?: string;
  copyright?: string;
  city?: string;
  province?: string;
  country?: string;
}

export interface PhotoFormData {
  albumIds?: string[];
  title: string;
  year: number;
  tags: string;
  exif: ExifData;
}

export interface PhotoUploadData extends PhotoFormData {
  file: File;
  albumBeforePhotoIds?: string[];
}

export type BatchFieldKey =
  | 'albumIds'
  | 'title'
  | 'year'
  | 'tags'
  | 'exif.camera'
  | 'exif.lens'
  | 'exif.aperture'
  | 'exif.shutterSpeed'
  | 'exif.iso'
  | 'exif.author'
  | 'exif.copyright'
  | 'exif.country'
  | 'exif.province'
  | 'exif.city';

export type BatchUploadStatus = 'pending' | 'uploading' | 'success' | 'failed';
export type ExifParseStatus = 'loading' | 'ready';
export type BatchUploadPhase = 'editing' | 'uploading' | 'results';

export interface PhotoUploadItem {
  id: string;
  file: File;
  fileKey: string;
  previewUrl: string;
  data: PhotoFormData;
  exifStatus: ExifParseStatus;
  uploadStatus: BatchUploadStatus;
  error?: string;
  uploadedPhoto?: Photo;
  analysisStatus?: 'loading' | 'ready' | 'failed';
  analysisError?: string;
}

export interface BatchUploadResult {
  attempted: number;
  succeeded: number;
  failed: number;
  photos: Photo[];
}

export interface PhotoModalProps {
  isOpen: boolean;
  mode: 'upload' | 'edit';
  photo?: Photo | null;
  onClose: () => void;
  onUpload?: (data: PhotoUploadData) => Promise<Photo | void>;
  onUploadBatchComplete?: (result: BatchUploadResult) => void | Promise<void>;
  onUpdate?: (id: string, data: PhotoFormData) => Promise<void>;
}
