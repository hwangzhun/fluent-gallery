import React, { useEffect, useRef } from 'react';
import { Edit, LoaderCircle, Sparkles, Upload, X } from 'lucide-react';
import { BatchEmptyPicker, BatchResults, BatchWorkspace } from './photo-modal/BatchUploadFields';
import { PhotoBasicFields, PhotoExifFields, PhotoPreview } from './photo-modal/PhotoModalFields';
import { usePhotoModalForm } from './photo-modal/usePhotoModalForm';
import type { PhotoModalProps } from './photo-modal/types';

export type {
  BatchFieldKey,
  BatchUploadResult,
  BatchUploadStatus,
  ExifData,
  PhotoFormData,
  PhotoModalProps,
  PhotoUploadData,
  PhotoUploadItem,
} from './photo-modal/types';

export const PhotoModal: React.FC<PhotoModalProps> = ({
  isOpen,
  mode,
  photo,
  onClose,
  onUpload,
  onUploadBatchComplete,
  onUpdate,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const form = usePhotoModalForm({
    mode,
    photo,
    onClose,
    onUpload,
    onUploadBatchComplete,
    onUpdate,
  });
  const closeDisabled = form.saving || form.phase === 'uploading';

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) form.handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, closeDisabled]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm animate-in fade-in duration-200 sm:p-5">
      <div className={`relative flex w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200 ${form.isUploadMode && form.items.length > 0 ? 'h-[min(720px,calc(100dvh-2rem))] max-w-6xl' : form.isUploadMode ? 'max-w-3xl' : 'max-h-[90vh] max-w-3xl'}`}>
        <div className="flex h-15 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5 sm:px-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            {form.isUploadMode ? <Upload size={20} /> : <Edit size={20} />}
            {form.isUploadMode ? '上传照片' : '编辑照片'}
            {form.isUploadMode && form.items.length > 0 && (
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{form.items.length} 张</span>
            )}
          </h2>
          <button
            ref={closeButtonRef}
            aria-label="关闭照片编辑窗口"
            onClick={form.handleClose}
            disabled={closeDisabled}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-gray-100 rounded-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={24} />
          </button>
        </div>

        <div className={`min-h-0 flex-1 overscroll-contain photo-modal-scroll ${form.isUploadMode ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
          <style>{`
            .photo-modal-scroll {
              scrollbar-width: thin;
              scrollbar-color: #d1d5db transparent;
            }
            .photo-modal-scroll::-webkit-scrollbar {
              width: 6px;
            }
            .photo-modal-scroll::-webkit-scrollbar-track {
              background: transparent;
              margin: 8px 0;
            }
            .photo-modal-scroll::-webkit-scrollbar-thumb {
              background: #d1d5db;
              border-radius: 3px;
              transition: background 0.2s;
            }
            .photo-modal-scroll::-webkit-scrollbar-thumb:hover {
              background: #9ca3af;
            }
          `}</style>
          <form id="photo-form" onSubmit={form.handleSubmit} className={`min-h-0 flex-1 ${form.isUploadMode ? 'flex flex-col' : 'space-y-5 p-6'}`}>
            {form.isUploadMode ? (
              form.items.length === 0 ? (
                <div className="flex min-h-0 flex-1 p-4 sm:p-6"><BatchEmptyPicker onFileSelect={form.handleFileSelect} onDrop={form.handleDrop} /></div>
              ) : form.phase === 'results' ? (
                <BatchResults items={form.items} successCount={form.successCount} failedCount={form.failedCount} />
              ) : form.activeItem ? (
                <BatchWorkspace
                  items={form.items}
                  activeItem={form.activeItem}
                  phase={form.phase}
                  completedCount={form.completedCount}
                  sharedFields={form.sharedFields}
                  onSelect={form.setActiveId}
                  onRemove={form.removeItem}
                  onFileSelect={form.handleFileSelect}
                  onChange={form.updateField}
                  onToggleShared={form.toggleSharedField}
                />
              ) : null
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <PhotoPreview previewUrl={photo?.thumbnailUrl || null} title={form.editData.title} />
                  <PhotoBasicFields data={form.editData} onChange={form.updateField} />
                </div>
                <PhotoExifFields data={form.editData} onChange={form.updateField} />
              </>
            )}

            {form.selectionNotice && form.phase === 'editing' && (
              <div role="status" className="absolute bottom-[76px] left-1/2 z-20 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 shadow-lg">
                {form.selectionNotice}
              </div>
            )}
            {form.error && (
              <div className={`${form.isUploadMode ? 'absolute bottom-[76px] left-1/2 z-20 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 shadow-lg' : ''} rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 animate-in slide-in-from-top-2 duration-200`}>
                {form.error}
              </div>
            )}
          </form>
        </div>

        <div className="photo-modal-footer flex min-h-16 flex-shrink-0 items-center justify-end gap-3 rounded-b-2xl border-t border-gray-200 bg-white px-5 py-3 sm:px-6">
          {form.isEditMode ? (
            <>
              <button type="button" onClick={form.handleClose} className="min-w-28 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors font-medium" disabled={form.saving}>
                取消
              </button>
              <button type="button" onClick={() => void form.suggestEditMetadata()} disabled={form.saving || form.analyzing} className="inline-flex items-center gap-2 rounded-lg border border-violet-200 px-4 py-2.5 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"><Sparkles size={16} />{form.analyzing ? 'AI 正在分析…' : 'AI 生成标题与标签'}</button>
              <button type="submit" form="photo-form" disabled={form.saving} className={`min-w-32 px-4 py-2.5 rounded-lg text-white font-medium transition-all ${form.saving ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30'}`}>
                {form.saving ? '保存中...' : '保存更改'}
              </button>
            </>
          ) : form.phase === 'results' ? (
            <>
              <button type="button" onClick={form.handleClose} className="min-w-28 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors font-medium">
                完成
              </button>
              {form.failedCount > 0 && (
                <button type="button" onClick={form.retryFailed} className="min-w-40 px-4 py-2.5 rounded-lg bg-blue-600 text-white font-medium shadow-lg shadow-blue-600/20 hover:bg-blue-700">
                  重试失败项（{form.failedCount}）
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" onClick={form.handleClose} disabled={form.phase === 'uploading'} className="min-w-28 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-50">
                取消
              </button>
              <button type="button" onClick={() => void form.suggestMetadata()} disabled={form.phase !== 'editing' || form.items.length === 0 || form.analyzing} className="inline-flex items-center gap-2 rounded-lg border border-violet-200 px-4 py-2.5 text-sm font-medium text-violet-700 disabled:opacity-50"><Sparkles size={16} />{form.analyzing ? 'AI 正在分析…' : 'AI 生成标题与标签'}</button>
              <button
                type="submit"
                form="photo-form"
                disabled={form.phase === 'uploading' || form.items.length === 0}
                className={`inline-flex min-w-44 items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white font-medium transition-all ${form.phase === 'uploading' || form.items.length === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30'}`}
              >
                {form.phase === 'uploading' ? <><LoaderCircle size={17} className="animate-spin" />上传中 {form.completedCount} / {form.items.length}</> : `上传 ${form.items.length} 张照片`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
