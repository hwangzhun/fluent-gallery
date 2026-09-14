import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Edit, LoaderCircle, Sparkles, Upload, X } from 'lucide-react';
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
  presentation = 'modal',
  photo,
  onClose,
  onUpload,
  onUploadBatchComplete,
  onUpdate,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const form = usePhotoModalForm({
    isOpen,
    mode,
    photo,
    onClose,
    onUpload,
    onUploadBatchComplete,
    onUpdate,
  });
  const closeDisabled = form.saving || form.phase === 'uploading';
  const isWorkspace = presentation === 'workspace' && form.isUploadMode;
  const hasPendingDraft = isWorkspace && form.phase === 'editing' && form.items.length > 0;

  const requestClose = useCallback(() => {
    if (closeDisabled) return;
    if (hasPendingDraft) {
      setExitConfirmOpen(true);
      return;
    }
    form.handleClose();
  }, [closeDisabled, hasPendingDraft, form.handleClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) requestClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, closeDisabled, requestClose]);

  useEffect(() => {
    if (!hasPendingDraft) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasPendingDraft]);

  if (!isOpen) return null;

  return (
    <div role={isWorkspace ? undefined : 'dialog'} aria-modal={isWorkspace ? undefined : 'true'} aria-labelledby="photo-modal-title" className={`photo-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-5 ${isWorkspace ? 'photo-workspace-route' : ''}`}>
      <div className={`photo-modal-panel relative flex w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${form.isUploadMode && form.items.length > 0 ? 'h-[min(720px,calc(100dvh-2rem))] max-w-6xl' : form.isUploadMode ? 'max-w-3xl' : 'max-h-[90vh] max-w-3xl'}`}>
        <div className="photo-modal-header flex h-15 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5 sm:px-6">
          <h2 id="photo-modal-title" className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            {isWorkspace ? (
              <><button ref={closeButtonRef} type="button" onClick={requestClose} disabled={closeDisabled} className="photo-workspace-back" aria-label="返回照片管理"><ArrowLeft size={19} /><span>返回照片管理</span></button><Upload className="photo-workspace-mobile-upload" size={20} /></>
            ) : form.isUploadMode ? <Upload size={20} /> : <Edit size={20} />}
            {form.isUploadMode ? '上传照片' : '编辑照片'}
            {form.isUploadMode && form.items.length > 0 && (
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{form.items.length} 张</span>
            )}
          </h2>
          {isWorkspace && <div className="photo-workspace-header-actions">
            {form.phase === 'results' ? <>
              {form.failedCount > 0 && <button type="button" aria-label={`重试失败项（${form.failedCount}）`} onClick={form.retryFailed} className="photo-workspace-secondary">重试失败项（{form.failedCount}）</button>}
              <button type="button" onClick={form.handleClose} className="photo-workspace-primary">返回照片管理</button>
            </> : <>
              <button type="button" aria-label={form.analyzing ? 'AI 正在分析…' : 'AI 生成标题与标签'} onClick={() => void form.suggestMetadata()} disabled={form.phase !== 'editing' || form.items.length === 0 || form.analyzing || form.titleGenerating} className="photo-workspace-secondary"><Sparkles size={16} />{form.analyzing ? '分析中…' : 'AI 生成'}</button>
              <button type="submit" form="photo-form" aria-label={form.phase === 'uploading' ? `上传中 ${form.completedCount} / ${form.items.length}` : `上传 ${form.items.length} 张照片`} disabled={form.phase === 'uploading' || form.items.length === 0 || form.metadataLoading} className="photo-workspace-primary">{form.phase === 'uploading' ? <><LoaderCircle size={17} className="animate-spin" />上传中 {form.completedCount} / {form.items.length}</> : <>上传 {form.items.length} 张照片</>}</button>
            </>}
          </div>}
          <button
            ref={isWorkspace ? undefined : closeButtonRef}
            aria-label={isWorkspace ? '关闭上传工作区' : '关闭照片编辑窗口'}
            onClick={requestClose}
            disabled={closeDisabled}
            className={`photo-modal-close text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-gray-100 rounded-lg disabled:cursor-not-allowed disabled:opacity-50 ${isWorkspace ? 'photo-workspace-mobile-close' : ''}`}
          >
            <X size={24} />
          </button>
        </div>

        {form.isUploadMode && form.authorError && <div role="alert" className="flex shrink-0 flex-wrap items-center gap-2 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{form.authorError}</span><button type="button" onClick={form.retryAuthorSettings} className="min-h-11 underline">重试读取</button></div>}
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
                <BatchResults items={form.items} successCount={form.successCount} processingCount={form.processingCount} failedCount={form.failedCount} />
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
                  onRegenerateTitle={() => void form.regenerateTitle()}
                  titleGenerating={form.activeTitleGenerating}
                  titleGenerationDisabled={form.analyzing || form.titleGenerating}
                  expandTags={isWorkspace}
                />
              ) : null
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <PhotoPreview previewUrl={photo?.thumbnailUrl || null} title={form.editData.title} />
                  <PhotoBasicFields data={form.editData} onChange={form.updateField} onRegenerateTitle={() => void form.regenerateTitle()} titleGenerating={form.activeTitleGenerating} titleGenerationDisabled={form.saving || form.analyzing || form.titleGenerating} />
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

        <div className={`photo-modal-footer flex min-h-16 flex-shrink-0 items-center justify-end gap-3 rounded-b-2xl border-t border-gray-200 bg-white px-5 py-3 sm:px-6 ${isWorkspace ? 'photo-workspace-footer' : ''}`}>
          {form.isEditMode ? (
            <>
              <button type="button" onClick={form.handleClose} className="min-w-28 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors font-medium" disabled={form.saving}>
                取消
              </button>
              <button type="button" aria-label={form.analyzing ? "AI 正在分析…" : "AI 生成标题与标签"} onClick={() => void form.suggestEditMetadata()} disabled={form.saving || form.analyzing || form.titleGenerating} className="inline-flex items-center gap-2 rounded-lg border border-violet-200 px-4 py-2.5 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"><Sparkles size={16} /><span className="photo-button-mobile">{form.analyzing ? '分析中…' : 'AI 生成'}</span><span className="photo-button-desktop">{form.analyzing ? 'AI 正在分析…' : 'AI 生成标题与标签'}</span></button>
              <button type="submit" form="photo-form" aria-label={form.saving ? "保存中..." : "保存更改"} disabled={form.saving} className={`min-w-32 px-4 py-2.5 rounded-lg text-white font-medium transition-all ${form.saving ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30'}`}>
                <span className="photo-button-mobile">{form.saving ? '保存中…' : '保存'}</span><span className="photo-button-desktop">{form.saving ? '保存中...' : '保存更改'}</span>
              </button>
            </>
          ) : form.phase === 'results' ? (
            <>
              <button type="button" onClick={form.handleClose} className="min-w-28 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors font-medium">
                完成
              </button>
              {form.failedCount > 0 && (
                <button type="button" aria-label={`重试失败项（${form.failedCount}）`} onClick={form.retryFailed} className="min-w-40 px-4 py-2.5 rounded-lg bg-blue-600 text-white font-medium shadow-lg shadow-blue-600/20 hover:bg-blue-700">
                  <span className="photo-button-mobile">重试 {form.failedCount} 项</span><span className="photo-button-desktop">重试失败项（{form.failedCount}）</span>
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" onClick={requestClose} disabled={form.phase === 'uploading'} className="min-w-28 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-50">
                取消
              </button>
              <button type="button" aria-label={form.analyzing ? "AI 正在分析…" : "AI 生成标题与标签"} onClick={() => void form.suggestMetadata()} disabled={form.phase !== 'editing' || form.items.length === 0 || form.analyzing || form.titleGenerating} className="inline-flex items-center gap-2 rounded-lg border border-violet-200 px-4 py-2.5 text-sm font-medium text-violet-700 disabled:opacity-50"><Sparkles size={16} /><span className="photo-button-mobile">{form.analyzing ? '分析中…' : 'AI 生成'}</span><span className="photo-button-desktop">{form.analyzing ? 'AI 正在分析…' : 'AI 生成标题与标签'}</span></button>
              <button
                type="submit"
                form="photo-form"
                aria-label={form.phase === 'uploading' ? `上传中 ${form.completedCount} / ${form.items.length}` : `上传 ${form.items.length} 张照片`}
                disabled={form.phase === 'uploading' || form.items.length === 0 || form.metadataLoading}
                className={`inline-flex min-w-44 items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white font-medium transition-all ${form.phase === 'uploading' || form.items.length === 0 || form.metadataLoading ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30'}`}
              >
                {form.phase === 'uploading' ? <><LoaderCircle size={17} className="animate-spin" />上传中 {form.completedCount} / {form.items.length}</> : <><span className="photo-button-mobile">上传 {form.items.length} 张</span><span className="photo-button-desktop">上传 {form.items.length} 张照片</span></>}
              </button>
            </>
          )}
        </div>
      </div>
      {exitConfirmOpen && <div role="dialog" aria-modal="true" aria-labelledby="upload-exit-title" className="studio-dialog-backdrop fixed inset-0 z-[90] grid place-items-center bg-slate-950/55 p-4">
        <div className="studio-dialog-card w-full max-w-md bg-white p-6">
          <h2 id="upload-exit-title" className="text-xl">离开上传工作区？</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">离开后，本次选择的照片和已填写的信息都会被清空。</p>
          <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setExitConfirmOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm">继续编辑</button><button type="button" onClick={() => { setExitConfirmOpen(false); form.handleClose(); }} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">确认离开</button></div>
        </div>
      </div>}
    </div>
  );
};
