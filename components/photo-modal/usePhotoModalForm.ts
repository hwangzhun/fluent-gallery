import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import type { Photo } from '../../types';
import {
  getFileKey,
  getPhotoTitle,
  isPhotoFormValid,
  MAX_BATCH_FILES,
  runWithConcurrency,
  updatePhotoFormField,
  UPLOAD_CONCURRENCY,
} from './batch';
import { parsePhotoExif } from './exif';
import type {
  BatchFieldKey,
  BatchUploadPhase,
  BatchUploadResult,
  ExifData,
  PhotoFormData,
  PhotoModalProps,
  PhotoUploadItem,
} from './types';

interface UsePhotoModalFormOptions extends Pick<
  PhotoModalProps,
  'mode' | 'photo' | 'onClose' | 'onUpload' | 'onUploadBatchComplete' | 'onUpdate'
> {}

function emptyFormData(): PhotoFormData {
  return { title: '', year: new Date().getFullYear(), tags: '', exif: {} };
}

function formDataFromPhoto(photo: Photo): PhotoFormData {
  return {
    title: photo.title,
    year: photo.year,
    tags: photo.tags.join(', '),
    exif: {
      camera: photo.exif?.camera || '',
      lens: photo.exif?.lens || '',
      aperture: photo.exif?.aperture || '',
      shutterSpeed: photo.exif?.shutterSpeed || '',
      iso: photo.exif?.iso || '',
      author: photo.exif?.author || '',
      copyright: photo.exif?.copyright || '',
      city: photo.exif?.city || '',
      province: photo.exif?.province || '',
      country: photo.exif?.country || '',
    },
  };
}

export function usePhotoModalForm({
  mode,
  photo,
  onClose,
  onUpload,
  onUploadBatchComplete,
  onUpdate,
}: UsePhotoModalFormOptions) {
  const [editData, setEditData] = useState<PhotoFormData>(emptyFormData);
  const [items, setItems] = useState<PhotoUploadItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sharedFields, setSharedFields] = useState<Set<BatchFieldKey>>(() => new Set());
  const [phase, setPhase] = useState<BatchUploadPhase>('editing');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectionNotice, setSelectionNotice] = useState('');
  const nextId = useRef(0);
  const previewUrls = useRef(new Set<string>());
  const uploadInFlight = useRef(false);

  const isUploadMode = mode === 'upload';
  const isEditMode = mode === 'edit';
  const activeItem = useMemo(
    () => items.find(item => item.id === activeId) || items[0] || null,
    [activeId, items],
  );
  const completedCount = items.filter(item => item.uploadStatus === 'success' || item.uploadStatus === 'failed').length;
  const successCount = items.filter(item => item.uploadStatus === 'success').length;
  const failedCount = items.filter(item => item.uploadStatus === 'failed').length;

  useEffect(() => {
    if (isEditMode && photo) {
      setEditData(formDataFromPhoto(photo));
      setError(null);
    }
  }, [isEditMode, photo]);

  useEffect(() => () => {
    previewUrls.current.forEach(url => URL.revokeObjectURL(url));
    previewUrls.current.clear();
  }, []);

  const parseItemExif = async (itemId: string, file: File) => {
    const parsed = await parsePhotoExif(file);
    setItems(current => current.map(item => item.id === itemId
      ? {
          ...item,
          exifStatus: 'ready',
          data: {
            ...item.data,
            year: parsed.year ?? item.data.year,
            exif: parsed.exif,
          },
        }
      : item));
  };

  const addFiles = (files: File[]) => {
    if (phase !== 'editing' || files.length === 0) return;

    const knownKeys = new Set(items.map(item => item.fileKey));
    const accepted: PhotoUploadItem[] = [];
    let duplicateCount = 0;
    let overflowCount = 0;
    let invalidCount = 0;

    for (const file of files) {
      const supported = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
      if (!supported) { invalidCount += 1; continue; }
      const fileKey = getFileKey(file);
      if (knownKeys.has(fileKey)) {
        duplicateCount += 1;
        continue;
      }
      knownKeys.add(fileKey);
      if (items.length + accepted.length >= MAX_BATCH_FILES) {
        overflowCount += 1;
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      accepted.push({
        id: `upload-${nextId.current++}`,
        file,
        fileKey,
        previewUrl,
        data: {
          title: getPhotoTitle(file),
          year: new Date().getFullYear(),
          tags: '',
          exif: {},
        },
        exifStatus: 'loading',
        uploadStatus: 'pending',
      });
    }

    setItems(current => [...current, ...accepted]);
    setActiveId(current => current || accepted[0]?.id || null);
    setError(null);

    const notices = [];
    if (duplicateCount) notices.push(`已忽略 ${duplicateCount} 个重复文件`);
    if (overflowCount) notices.push(`已达到 ${MAX_BATCH_FILES} 张上限，${overflowCount} 个文件未加入`);
    if (invalidCount) notices.push(`已忽略 ${invalidCount} 个不支持的文件；仅支持 JPEG、PNG、WebP 或 HEIC`);
    setSelectionNotice(notices.join('；'));

    accepted.forEach(item => void parseItemExif(item.id, item.file));
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    addFiles(Array.from(event.dataTransfer.files || []));
  };

  const removeItem = (itemId: string) => {
    if (phase !== 'editing') return;
    const index = items.findIndex(item => item.id === itemId);
    if (index < 0) return;

    const removed = items[index];
    URL.revokeObjectURL(removed.previewUrl);
    previewUrls.current.delete(removed.previewUrl);
    const remaining = items.filter(item => item.id !== itemId);
    setItems(remaining);
    if (activeId === itemId) {
      setActiveId(remaining[index]?.id || remaining[index - 1]?.id || null);
    }
    setSelectionNotice('');
    setError(null);
  };

  const updateField = (field: BatchFieldKey, value: string | number) => {
    setError(null);
    if (isEditMode) {
      setEditData(current => updatePhotoFormField(current, field, value));
      return;
    }
    if (phase !== 'editing' || !activeItem) return;

    setItems(current => current.map(item => (
      item.id === activeItem.id || sharedFields.has(field)
        ? { ...item, data: updatePhotoFormField(item.data, field, value) }
        : item
    )));
  };

  const toggleSharedField = (field: BatchFieldKey) => {
    if (phase !== 'editing') return;
    setSharedFields(current => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const resetBatch = () => {
    previewUrls.current.forEach(url => URL.revokeObjectURL(url));
    previewUrls.current.clear();
    setItems([]);
    setActiveId(null);
    setSharedFields(new Set());
    setPhase('editing');
    setSelectionNotice('');
  };

  const handleClose = () => {
    if (phase === 'uploading' || saving) return;
    resetBatch();
    setEditData(emptyFormData());
    setError(null);
    onClose();
  };

  const uploadTargets = async (targets: PhotoUploadItem[]) => {
    if (targets.length === 0 || uploadInFlight.current) return;

    uploadInFlight.current = true;
    setPhase('uploading');
    setError(null);
    let succeeded = 0;
    let failed = 0;
    const photos: Photo[] = [];
    const failedIds: string[] = [];

    await runWithConcurrency(targets, UPLOAD_CONCURRENCY, async target => {
      setItems(current => current.map(item => item.id === target.id
        ? { ...item, uploadStatus: 'uploading', error: undefined }
        : item));
      try {
        if (!onUpload) throw new Error('上传功能不可用');
        const uploadedPhoto = await onUpload({ file: target.file, ...target.data });
        succeeded += 1;
        if (uploadedPhoto) photos.push(uploadedPhoto);
        setItems(current => current.map(item => item.id === target.id
          ? { ...item, uploadStatus: 'success', uploadedPhoto: uploadedPhoto || undefined, error: undefined }
          : item));
      } catch (uploadError) {
        failed += 1;
        failedIds.push(target.id);
        const message = uploadError instanceof Error ? uploadError.message : '上传失败，请重试';
        setItems(current => current.map(item => item.id === target.id
          ? { ...item, uploadStatus: 'failed', error: message }
          : item));
      }
    });

    const result: BatchUploadResult = { attempted: targets.length, succeeded, failed, photos };
    if (failedIds.length) setActiveId(failedIds[0]);
    try {
      await onUploadBatchComplete?.(result);
    } catch (completionError) {
      console.error('刷新图库失败:', completionError);
    } finally {
      uploadInFlight.current = false;
      setPhase('results');
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (isEditMode) {
      if (!photo) return;
      setSaving(true);
      setError(null);
      try {
        await onUpdate?.(photo.id, editData);
        handleClose();
      } catch (saveError) {
        console.error('保存失败:', saveError);
        setError(saveError instanceof Error ? saveError.message : '保存失败，请重试');
      } finally {
        setSaving(false);
      }
      return;
    }

    if (phase !== 'editing' || items.length === 0) return;
    const invalidItem = items.find(item => !isPhotoFormValid(item.data));
    if (invalidItem) {
      setActiveId(invalidItem.id);
      setError('请填写每张照片的标题和有效年份');
      return;
    }
    await uploadTargets(items);
  };

  const retryFailed = async () => {
    await uploadTargets(items.filter(item => item.uploadStatus === 'failed'));
  };

  return {
    activeItem,
    completedCount,
    editData,
    error,
    failedCount,
    handleClose,
    handleDrop,
    handleFileSelect,
    handleSubmit,
    isEditMode,
    isUploadMode,
    items,
    phase,
    removeItem,
    retryFailed,
    saving,
    selectionNotice,
    setActiveId,
    sharedFields,
    successCount,
    toggleSharedField,
    updateField,
  };
}
