import { settingsService, type AuthorSettings } from '../../api/settingsService';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import type { Photo } from '../../types';
import {
  getFileKey,
  getPhotoTitle,
  EXIF_PARSE_CONCURRENCY,
  isPhotoFormValid,
  MAX_BATCH_FILES,
  MAX_BATCH_TOTAL_BYTES,
  MAX_SINGLE_FILE_BYTES,
  runWithConcurrency,
  updatePhotoFormField,
  UPLOAD_CONCURRENCY,
} from './batch';
import { parsePhotoExif } from './exif';
import { aiService } from '../../api/aiService';
import type {
  BatchFieldKey,
  BatchUploadPhase,
  BatchUploadResult,
  ExifData,
  PhotoFormData,
  PhotoModalProps,
  PhotoUploadResult,
  PhotoUploadItem,
  QueuedPhotoUpload,
} from './types';

interface UsePhotoModalFormOptions extends Pick<
  PhotoModalProps,
  'isOpen' | 'mode' | 'photo' | 'onClose' | 'onUpload' | 'onUploadBatchComplete' | 'onUpdate'
> {}

function isQueuedPhotoUpload(result: PhotoUploadResult | void): result is QueuedPhotoUpload {
  return Boolean(result && 'kind' in result && result.kind === 'queued');
}

function emptyFormData(): PhotoFormData {
  return { title: '', year: new Date().getFullYear(), tags: '', exif: {} };
}

function formDataFromPhoto(photo: Photo): PhotoFormData {
  return {
    title: photo.title,
    albumIds: photo.albumIds || photo.albums?.map(album => album.id) || [],
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
  isOpen,
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
  const [analyzing, setAnalyzing] = useState(false);
  const nextId = useRef(0);
  const previewUrls = useRef(new Set<string>());
  const uploadInFlight = useRef(false);
  const authorRequest = useRef<Promise<AuthorSettings | null> | null>(null);
  const [authorReady, setAuthorReady] = useState(false);
  const [authorError, setAuthorError] = useState('');
  const editedFields = useRef(new Map<string, Set<BatchFieldKey>>());

  const isUploadMode = mode === 'upload';
  const isEditMode = mode === 'edit';
  const activeItem = useMemo(
    () => items.find(item => item.id === activeId) || items[0] || null,
    [activeId, items],
  );
  const completedCount = items.filter(item => item.uploadStatus === 'success' || item.uploadStatus === 'failed').length;
  const successCount = items.filter(item => item.uploadStatus === 'success').length;
  const processingCount = items.filter(item => item.uploadStatus === 'processing').length;
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

  const loadAuthorSettings = () => {
    setAuthorReady(false);
    setAuthorError('');
    const request = settingsService.getAuthorSettings().then(value => {
      if (authorRequest.current === request) setAuthorReady(true);
      return value;
    }).catch(() => {
      if (authorRequest.current === request) setAuthorError('无法读取作者默认值，请重试后上传。');
      return null;
    });
    authorRequest.current = request;
  };

  useEffect(() => {
    if (!isOpen || !isUploadMode) return;
    loadAuthorSettings();
    return () => { authorRequest.current = null; };
  }, [isOpen, isUploadMode]);

  const parseItemExif = async (itemId: string, file: File) => {
    const request = authorRequest.current;
    const [parsed, defaults] = await Promise.all([parsePhotoExif(file), request]);
    if (!defaults || request !== authorRequest.current) return;
    setItems(current => current.map(item => {
      if (item.id !== itemId || item.exifStatus === 'ready') return item;
      const touched = editedFields.current.get(itemId);
      const exif: ExifData = { ...parsed.exif,
        ...(defaults.author ? { author: defaults.author } : {}),
        ...(defaults.copyright ? { copyright: defaults.copyright } : {}),
      };
      for (const field of touched || []) {
        if (field.startsWith('exif.')) {
          const key = field.slice(5) as keyof ExifData;
          Object.assign(exif, { [key]: item.data.exif[key] });
        }
      }
      return { ...item, exifStatus: 'ready', data: { ...item.data,
        year: touched?.has('year') ? item.data.year : parsed.year ?? item.data.year, exif } };
    }));
  };

  const retryAuthorSettings = () => {
    setError(null);
    loadAuthorSettings();
    void runWithConcurrency<PhotoUploadItem>(items.filter(item => item.exifStatus === 'loading'), EXIF_PARSE_CONCURRENCY, item => parseItemExif(item.id, item.file));
  };

  const addFiles = (files: File[]) => {
    if (phase !== 'editing' || files.length === 0) return;

    const knownKeys = new Set(items.map(item => item.fileKey));
    const accepted: PhotoUploadItem[] = [];
    let duplicateCount = 0;
    let invalidCount = 0;
    let overflowCount = 0;
    let oversizedCount = 0;
    let totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);

    for (const file of files) {
      const supported = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
      if (!supported) { invalidCount += 1; continue; }
      if (file.size > MAX_SINGLE_FILE_BYTES) { oversizedCount += 1; continue; }
      const fileKey = getFileKey(file);
      if (knownKeys.has(fileKey)) {
        duplicateCount += 1;
        continue;
      }
      if (items.length + accepted.length >= MAX_BATCH_FILES || totalBytes + file.size > MAX_BATCH_TOTAL_BYTES) {
        overflowCount += 1;
        continue;
      }
      knownKeys.add(fileKey);
      totalBytes += file.size;
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
    if (invalidCount) notices.push(`已忽略 ${invalidCount} 个不支持的文件；仅支持 JPEG、PNG、WebP 或 HEIC`);
    if (oversizedCount) notices.push(`已忽略 ${oversizedCount} 个超过 50 MB 的文件`);
    if (overflowCount) notices.push(`已达每批 ${MAX_BATCH_FILES} 张或 1 GB 上限，${overflowCount} 个文件未加入`);
    setSelectionNotice(notices.join('；'));

    void runWithConcurrency(accepted, EXIF_PARSE_CONCURRENCY, item => parseItemExif(item.id, item.file));
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

  const updateField = (field: BatchFieldKey, value: string | number | string[]) => {
    setError(null);
    if (isEditMode) {
      setEditData(current => updatePhotoFormField(current, field, value));
      return;
    }
    if (phase !== 'editing' || !activeItem) return;

    for (const item of items) {
      if (item.id === activeItem.id || sharedFields.has(field)) {
        const touched = editedFields.current.get(item.id) || new Set<BatchFieldKey>();
        touched.add(field);
        editedFields.current.set(item.id, touched);
      }
    }
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
    editedFields.current.clear();
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
    const jobs: QueuedPhotoUpload[] = [];
    const failedIds: string[] = [];

    await runWithConcurrency(targets, targets.some(item => item.data.albumIds?.length) ? 1 : UPLOAD_CONCURRENCY, async target => {
      setItems(current => current.map(item => item.id === target.id
        ? { ...item, uploadStatus: 'uploading', error: undefined }
        : item));
      try {
        if (!onUpload) throw new Error('上传功能不可用');
        const laterIds = items.slice(items.findIndex(item => item.id === target.id) + 1).flatMap(item => item.uploadedPhoto ? [item.uploadedPhoto.id] : []);
        const uploadResult = await onUpload({ file: target.file, ...target.data, ...(target.data.albumIds?.length && laterIds.length ? { albumBeforePhotoIds: laterIds } : {}) });
        succeeded += 1;
        const queuedUpload = isQueuedPhotoUpload(uploadResult) ? uploadResult : undefined;
        const uploadedPhoto = uploadResult && !isQueuedPhotoUpload(uploadResult) ? uploadResult : undefined;
        if (uploadedPhoto) photos.push(uploadedPhoto);
        if (queuedUpload) jobs.push(queuedUpload);
        setItems(current => current.map(item => item.id === target.id
          ? { ...item, uploadStatus: queuedUpload ? 'processing' : 'success', uploadedPhoto, queuedUpload, error: undefined }
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

    const result: BatchUploadResult = { attempted: targets.length, succeeded, failed, photos, jobs };
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
    if (!authorReady || items.some(item => item.exifStatus !== 'ready')) { setError('请等待照片信息和作者默认值读取完成。'); return; }
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

  const suggestMetadata = async () => {
    if (phase !== 'editing' || items.length === 0 || analyzing) return;
    setAnalyzing(true);
    let next = 0;
    const workers = Array.from({ length: Math.min(2, items.length) }, async () => {
      while (next < items.length) {
        const target = items[next++];
        setItems(current => current.map(item => item.id === target.id ? { ...item, analysisStatus: 'loading', analysisError: undefined } : item));
        try {
          const suggested = await aiService.suggestMetadata(target.file);
          setItems(current => current.map(item => item.id === target.id ? {
            ...item,
            analysisStatus: 'ready',
            data: { ...item.data, title: suggested.title, tags: [...new Set([...item.data.tags.split(',').map(value => value.trim()).filter(Boolean), ...suggested.tags])].join(', ') },
          } : item));
        } catch (reason) {
          setItems(current => current.map(item => item.id === target.id ? { ...item, analysisStatus: 'failed', analysisError: reason instanceof Error ? reason.message : 'AI 照片信息生成失败' } : item));
        }
      }
    });
    await Promise.all(workers);
    setAnalyzing(false);
  };

  const suggestEditMetadata = async () => {
    if (!isEditMode || !photo || analyzing || saving) return;
    setAnalyzing(true);
    setError(null);
    try {
      const suggested = await aiService.suggestMetadataForPhoto(photo.id);
      setEditData(current => ({
        ...current,
        title: suggested.title,
        tags: [...new Set([...current.tags.split(',').map(value => value.trim()).filter(Boolean), ...suggested.tags])].join(', '),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AI 照片信息生成失败');
    } finally {
      setAnalyzing(false);
    }
  };

  return {
    authorError,
    retryAuthorSettings,
    metadataLoading: !authorReady || items.some(item => item.exifStatus !== 'ready'),
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
    suggestMetadata,
    analyzing,
    saving,
    suggestEditMetadata,
    selectionNotice,
    setActiveId,
    sharedFields,
    successCount,
    processingCount,
    toggleSharedField,
    updateField,
  };
}
