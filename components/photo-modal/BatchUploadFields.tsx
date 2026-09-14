import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Info,
  LoaderCircle,
  Plus,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';
import { MAX_BATCH_FILES } from './batch';
import { PhotoBasicFields, PhotoExifFields } from './PhotoModalFields';
import type { BatchFieldKey, BatchUploadPhase, PhotoUploadItem } from './types';

interface FilePickerProps {
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}

const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
const isHeic = (file: File) => ['image/heic', 'image/heif'].includes(file.type) || /\.(heic|heif)$/i.test(file.name);

function UploadPreview({ item, className }: { item: PhotoUploadItem; className: string }) {
  return isHeic(item.file)
    ? <div className={`${className} grid place-items-center bg-slate-100 px-2 text-center text-[10px] leading-4 text-slate-500`}><span>HEIC<br />上传后转换预览</span></div>
    : <img src={item.previewUrl} alt={item.data.title} className={className} />;
}

export function BatchEmptyPicker({ onFileSelect, onDrop }: FilePickerProps) {
  return (
    <section
      onDrop={onDrop}
      onDragOver={(event) => event.preventDefault()}
      className="batch-empty-picker relative grid min-h-[320px] flex-1 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-10 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/40"
    >
      <input type="file" accept={ACCEPTED_IMAGE_TYPES} multiple onChange={onFileSelect} aria-label="选择要上传的照片" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      <div className="pointer-events-none max-w-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200"><ImagePlus size={27} /></div>
        <h3 className="mt-4 text-base font-semibold text-slate-900">拖入照片，或点击选择</h3>
        <p className="mt-1.5 text-sm leading-6 text-slate-500">支持一次选择多张照片，每批最多 {MAX_BATCH_FILES} 张</p>
        <span className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm"><Upload size={16} />选择照片</span>
      </div>
    </section>
  );
}

function StatusDot({ item }: { item: PhotoUploadItem }) {
  if (item.uploadStatus === 'uploading') return <span title="上传中" className="grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-white"><LoaderCircle size={12} className="animate-spin" /></span>;
  if (item.uploadStatus === 'processing') return <span title="后台处理中" className="grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-white"><LoaderCircle size={12} className="animate-spin" /></span>;
  if (item.uploadStatus === 'success') return <span title="已完成" className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white"><CheckCircle2 size={12} /></span>;
  if (item.uploadStatus === 'failed') return <span title="上传失败" className="grid h-5 w-5 place-items-center rounded-full bg-red-500 text-white"><AlertCircle size={12} /></span>;
  if (item.exifStatus === 'loading') return <span title="正在读取照片信息" className="grid h-5 w-5 place-items-center rounded-full bg-slate-700/80 text-white"><LoaderCircle size={12} className="animate-spin" /></span>;
  return <span title="等待上传" className="h-2.5 w-2.5 rounded-full bg-white ring-2 ring-slate-400" />;
}

function UploadStatus({ item }: { item: PhotoUploadItem }) {
  if (item.uploadStatus === 'uploading') return <span className="inline-flex items-center gap-1.5 text-blue-600"><LoaderCircle size={13} className="animate-spin" />上传中</span>;
  if (item.uploadStatus === 'processing') return <span className="inline-flex items-center gap-1.5 text-amber-600"><LoaderCircle size={13} className="animate-spin" />后台处理中</span>;
  if (item.uploadStatus === 'success') return <span className="inline-flex items-center gap-1.5 text-emerald-600"><CheckCircle2 size={13} />已完成</span>;
  if (item.uploadStatus === 'failed') return <span className="inline-flex items-center gap-1.5 text-red-600"><AlertCircle size={13} />失败</span>;
  if (item.analysisStatus === 'loading') return <span className="inline-flex items-center gap-1.5 text-violet-600"><LoaderCircle size={13} className="animate-spin" />AI 分析中</span>;
  if (item.analysisStatus === 'failed') return <span className="inline-flex items-center gap-1.5 text-red-600"><AlertCircle size={13} />AI 生成失败</span>;
  if (item.analysisStatus === 'ready') return <span className="inline-flex items-center gap-1.5 text-violet-600"><CheckCircle2 size={13} />标题与标签已生成</span>;
  if (item.exifStatus === 'loading') return <span className="inline-flex items-center gap-1.5 text-slate-500"><LoaderCircle size={13} className="animate-spin" />读取信息</span>;
  return <span className="text-slate-500">等待上传</span>;
}

interface BatchQueueProps {
  items: PhotoUploadItem[];
  activeId: string | null;
  phase: BatchUploadPhase;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
}

function BatchQueue({ items, activeId, phase, onSelect, onRemove, onFileSelect }: BatchQueueProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ left: false, right: false });

  const updateScrollState = () => {
    const strip = stripRef.current;
    if (!strip) return;
    setScrollState({
      left: strip.scrollLeft > 2,
      right: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2,
    });
  };

  useEffect(() => {
    const frame = requestAnimationFrame(updateScrollState);
    const onResize = () => updateScrollState();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, [items.length]);

  useEffect(() => {
    const active = stripRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    active?.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  const scrollQueue = (direction: -1 | 1) => {
    stripRef.current?.scrollBy?.({ left: direction * 360, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  return (
    <div className="batch-queue border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-5">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p aria-label={`照片数量：${items.length}`} className="text-xs font-medium text-slate-500">照片 <span className="font-semibold text-slate-800">{items.length}</span> / {MAX_BATCH_FILES}</p>
        <p className="hidden text-xs text-slate-400 sm:block">选择缩略图编辑对应照片</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => scrollQueue(-1)}
          disabled={!scrollState.left}
          aria-label="向前浏览照片"
          className="hidden h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100 disabled:invisible sm:grid"
        >
          <ChevronLeft size={17} />
        </button>

        <div ref={stripRef} onScroll={updateScrollState} className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto px-0.5 py-1">
          {items.map((item, index) => (
            <div key={item.id} className="batch-queue-item group relative h-[68px] w-[68px] shrink-0">
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              aria-label={`编辑第 ${index + 1} 张：${item.data.title}`}
              aria-current={activeId === item.id ? 'true' : undefined}
              className={`relative h-full w-full overflow-hidden rounded-xl bg-slate-900 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeId === item.id ? 'ring-2 ring-blue-500' : 'ring-1 ring-slate-300 hover:ring-slate-500'}`}
            >
              <UploadPreview item={item} className="h-full w-full object-contain" />
              <span className="absolute bottom-1 left-1 grid h-4 min-w-4 place-items-center rounded bg-black/65 px-1 text-[10px] font-medium text-white">{index + 1}</span>
              <span className="absolute bottom-1 right-1"><StatusDot item={item} /></span>
            </button>
            {phase === 'editing' && (
              <button type="button" onClick={() => onRemove(item.id)} aria-label={`移除 ${item.data.title}`} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-white/95 text-slate-600 opacity-100 shadow hover:bg-red-500 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"><Trash2 size={11} /></button>
            )}
          </div>
          ))}
          {phase === 'editing' && items.length < MAX_BATCH_FILES && (
            <label className="batch-queue-add relative grid h-[68px] w-[68px] shrink-0 cursor-pointer place-items-center rounded-xl border border-dashed border-slate-300 bg-white text-slate-500 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600">
              <span className="flex flex-col items-center gap-0.5 text-[10px] font-medium"><Plus size={18} />添加</span>
              <input type="file" accept={ACCEPTED_IMAGE_TYPES} multiple onChange={onFileSelect} aria-label="继续添加照片" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </label>
          )}
        </div>

        <button
          type="button"
          onClick={() => scrollQueue(1)}
          disabled={!scrollState.right}
          aria-label="向后浏览照片"
          className="hidden h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100 disabled:invisible sm:grid"
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}

interface BatchWorkspaceProps {
  items: PhotoUploadItem[];
  activeItem: PhotoUploadItem;
  phase: BatchUploadPhase;
  completedCount: number;
  sharedFields: Set<BatchFieldKey>;
  sharedTags: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onChange: (field: BatchFieldKey, value: string | number | string[]) => void;
  onToggleShared: (field: BatchFieldKey) => void;
  onToggleTagShared: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onRegenerateTitle: () => void;
  titleGenerating: boolean;
  titleGenerationDisabled: boolean;
  expandTags?: boolean;
}

export function BatchWorkspace({ items, activeItem, phase, completedCount, sharedFields, sharedTags, onSelect, onRemove, onFileSelect, onChange, onToggleShared, onToggleTagShared, onRemoveTag, onRegenerateTitle, titleGenerating, titleGenerationDisabled, expandTags = false }: BatchWorkspaceProps) {
  const [panel, setPanel] = useState<'basic' | 'details'>('basic');
  const disabled = phase !== 'editing';
  const activeIndex = items.findIndex(item => item.id === activeItem.id);

  useEffect(() => setPanel('basic'), [activeItem.id]);

  const selectRelative = (offset: number) => {
    const next = items[activeIndex + offset];
    if (next) onSelect(next.id);
  };

  return (
    <div className="batch-workspace relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <BatchQueue items={items} activeId={activeItem.id} phase={phase} onSelect={onSelect} onRemove={onRemove} onFileSelect={onFileSelect} />
      <div className="batch-editor no-scrollbar grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] md:overflow-hidden">
        <section className="batch-preview studio-upload-preview relative flex min-h-[220px] items-center justify-center overflow-hidden bg-slate-950 md:min-h-0">
          <UploadPreview item={activeItem} className="relative h-full max-h-full w-full object-contain" />
          <div className="studio-upload-caption flex items-end justify-between gap-4 px-4 py-4 text-white">
            <div className="min-w-0"><p className="truncate text-sm font-medium">{activeItem.file.name}</p><p className="mt-0.5 text-xs text-white/65">第 {activeIndex + 1} 张，共 {items.length} 张</p></div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => selectRelative(-1)} disabled={activeIndex === 0} aria-label="上一张照片" className="grid h-8 w-8 place-items-center rounded-lg bg-black/30 text-white backdrop-blur hover:bg-black/50 disabled:opacity-30"><ChevronLeft size={18} /></button>
              <button type="button" onClick={() => selectRelative(1)} disabled={activeIndex === items.length - 1} aria-label="下一张照片" className="grid h-8 w-8 place-items-center rounded-lg bg-black/30 text-white backdrop-blur hover:bg-black/50 disabled:opacity-30"><ChevronRight size={18} /></button>
            </div>
          </div>
        </section>
        <section className="batch-inspector flex flex-col border-t border-slate-200 bg-white md:min-h-0 md:border-l md:border-t-0">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 border-b border-slate-200 px-4 sm:px-5">
            <div className="flex shrink-0" role="tablist" aria-label="照片信息">
              <button type="button" role="tab" aria-selected={panel === 'basic'} onClick={() => setPanel('basic')} className={`inline-flex h-12 items-center gap-2 border-b-2 px-1 text-sm font-medium ${panel === 'basic' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}><SlidersHorizontal size={15} />基本信息</button>
              <button type="button" role="tab" aria-selected={panel === 'details'} onClick={() => setPanel('details')} className={`ml-6 inline-flex h-12 items-center gap-2 border-b-2 px-1 text-sm font-medium ${panel === 'details' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}><Info size={15} />拍摄信息</button>
            </div>
            <span className="text-xs"><UploadStatus item={activeItem} /></span>
          </div>
          <div className="photo-modal-scroll flex-none overflow-visible px-4 py-4 sm:px-5 md:min-h-0 md:flex-1 md:overflow-y-auto">
            {panel === 'basic' ? (
              <>
                <PhotoBasicFields data={activeItem.data} onChange={onChange} sharedFields={sharedFields} onToggleShared={onToggleShared} sharedTags={sharedTags} onToggleTagShared={onToggleTagShared} onRemoveTag={onRemoveTag} disabled={disabled} editorKey={activeItem.id} onRegenerateTitle={onRegenerateTitle} titleGenerating={titleGenerating} titleGenerationDisabled={titleGenerationDisabled} expandTags={expandTags} />
                {activeItem.titleError && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">AI 重新生成标题失败：{activeItem.titleError}</p>}
                {activeItem.analysisError && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">AI 生成标题与标签失败：{activeItem.analysisError}</p>}
              </>
            ) : (
              <PhotoExifFields data={activeItem.data} onChange={onChange} sharedFields={sharedFields} onToggleShared={onToggleShared} disabled={disabled} loadingExif={activeItem.exifStatus === 'loading'} compact />
            )}
          </div>
        </section>
      </div>
      {phase === 'uploading' && <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow"><LoaderCircle size={14} className="animate-spin" />正在上传 {completedCount} / {items.length}</div>}
    </div>
  );
}

interface BatchResultsProps { items: PhotoUploadItem[]; successCount: number; processingCount: number; failedCount: number; }

export function BatchResults({ items, successCount, processingCount, failedCount }: BatchResultsProps) {
  return (
    <section className="batch-results flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={`flex shrink-0 items-center gap-3 border-b px-5 py-4 ${failedCount ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${failedCount ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>{failedCount ? <AlertCircle size={21} /> : <CheckCircle2 size={21} />}</div>
        <div><h3 className="text-sm font-semibold text-slate-900">{processingCount ? '已提交后台处理' : '批量上传完成'}</h3><p className="mt-0.5 text-sm text-slate-600">{processingCount ? `已完成 ${successCount} 张，处理中 ${processingCount} 张` : `成功 ${successCount} 张`}{failedCount ? `，失败 ${failedCount} 张` : ''}</p></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(item => (
            <article key={item.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <UploadPreview item={item} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-900">{item.data.title}</p><div className="mt-1 text-xs"><UploadStatus item={item} /></div>{item.error && <p className="mt-1 line-clamp-2 text-xs text-red-600" title={item.error}>{item.error}</p>}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
