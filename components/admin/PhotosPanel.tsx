import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Edit3, Eye, Filter, Grid2X2, Heart, ImagePlus, List, Search, Tag, Trash2, X } from 'lucide-react';
import { PhotoImage } from '../PhotoImage';
import { Photo } from '../../types';
import { photoService, type AdminPhotoSort } from '../../services/photoService';
import { tagService } from '../../services/tagService';
import { photoUploadService } from '../../services/photoUploadService';
import { PhotoModal, type BatchUploadResult, type PhotoFormData, type PhotoUploadData } from '../PhotoModal';

type Mode = 'list' | 'grid';
type PageSize = 30 | 60 | 120;
const PAGE_SIZES: PageSize[] = [30, 60, 120];
const THUMBNAIL_MIN = 80;
const THUMBNAIL_MAX = 200;
const THUMBNAIL_STEP = 10;

function initialPageSize(): PageSize {
  const saved = Number(localStorage.getItem('fluent-gallery-admin-page-size'));
  return PAGE_SIZES.includes(saved as PageSize) ? saved as PageSize : 30;
}

function initialThumbnailSize(): number {
  const saved = Number(localStorage.getItem('fluent-gallery-admin-thumbnail-size'));
  return Number.isFinite(saved) ? Math.min(THUMBNAIL_MAX, Math.max(THUMBNAIL_MIN, saved)) : 110;
}

function pageTokens(page: number, totalPages: number): Array<number | string> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, page - 1, page, page + 1].filter(value => value >= 1 && value <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | string> = [];
  sorted.forEach((value, index) => { if (index && value - sorted[index - 1] > 1) result.push(`ellipsis-${value}`); result.push(value); });
  return result;
}

function ConfirmDialog({ title, description, onCancel, onConfirm }: { title: string; description: string; onCancel: () => void; onConfirm: () => void }) {
  return <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6"><h2 id="confirm-title">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p><div className="mt-6 flex justify-end gap-3"><button onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">取消</button><button autoFocus onClick={onConfirm} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white">确认删除</button></div></div></div>;
}

export function PhotosPanel({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [year, setYear] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [items, setItems] = useState<Photo[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(initialPageSize);
  const [thumbnailSize, setThumbnailSize] = useState(initialThumbnailSize);
  const [sort, setSort] = useState<AdminPhotoSort>('latest');
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [filterOpen, setFilterOpen] = useState(false);
  const [modal, setModal] = useState<'upload' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Photo | null>(null);
  const [deleting, setDeleting] = useState<Photo | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query.trim()); setPage(1); }, 250); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => { tagService.getAvailableYears().then(setAvailableYears).catch(() => setAvailableYears([])); tagService.getAllTagNames().then(setAvailableTags).catch(() => setAvailableTags([])); }, [reloadVersion]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError('');
    photoService.getAdminPhotos({ page, pageSize, year: year || undefined, tags: tags.length ? tags : undefined, search: search || undefined, sort, signal: controller.signal })
      .then(result => {
        setItems(result.items); setTotal(result.total); setTotalPages(result.totalPages);
        if (result.totalPages > 0 && page > result.totalPages) setPage(result.totalPages);
      })
      .catch(reason => {
        if (reason?.name === 'AbortError') return;
        const message = reason instanceof Error ? reason.message : '照片加载失败';
        if (/登录|会话|认证/.test(message)) onSessionExpired(); else setLoadError(message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, pageSize, year, tags, search, sort, reloadVersion, onSessionExpired]);

  const activeFilters = useMemo(() => Boolean(query || year || tags.length), [query, year, tags]);
  const clear = () => { setQuery(''); setSearch(''); setYear(null); setTags([]); setPage(1); };
  const toggleTag = (value: string) => { setTags(current => current.includes(value) ? current.filter(tag => tag !== value) : [...current, value]); setPage(1); };
  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2600); };
  const upload = async (data: PhotoUploadData) => photoUploadService.uploadPhoto(data);
  const completeUploadBatch = async (result: BatchUploadResult) => { setPage(1); setReloadVersion(value => value + 1); showNotice(result.failed ? `已上传 ${result.succeeded} 张，${result.failed} 张失败` : `已上传 ${result.succeeded} 张照片`); };
  const update = async (id: string, data: PhotoFormData) => {
    await photoService.updatePhoto(id, { title: data.title, year: Number(data.year), tags: data.tags.split(',').map(tag => tag.trim()).filter(Boolean), exif: { camera: data.exif.camera || '', lens: data.exif.lens || '', aperture: data.exif.aperture || '', shutterSpeed: data.exif.shutterSpeed || '', iso: data.exif.iso || '', author: data.exif.author || '', copyright: data.exif.copyright || '', city: data.exif.city || '', province: data.exif.province || '', country: data.exif.country || '' } });
    setReloadVersion(value => value + 1); showNotice('照片已更新');
  };
  const deletePhoto = async () => {
    if (!deleting) return;
    try { await photoService.deletePhoto(deleting.id); setDeleting(null); if (items.length === 1 && page > 1) setPage(value => value - 1); else setReloadVersion(value => value + 1); showNotice('照片已删除'); }
    catch (reason) { showNotice(reason instanceof Error ? reason.message : '照片删除失败'); }
  };
  const changePageSize = (value: PageSize) => { localStorage.setItem('fluent-gallery-admin-page-size', String(value)); setPageSize(value); setPage(1); };
  const changeThumbnailSize = (value: number) => { localStorage.setItem('fluent-gallery-admin-thumbnail-size', String(value)); setThumbnailSize(value); };
  const rangeStart = total ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(page * pageSize, total);

  return <section className="space-y-5" aria-busy={loading} style={{ '--studio-thumbnail-size': `${thumbnailSize}px`, '--studio-card-size': `${Math.round(thumbnailSize * 2.15)}px` } as React.CSSProperties}>
    <div className="studio-photo-toolbar flex flex-col gap-4 border border-slate-200 bg-white p-4 xl:flex-row xl:items-center"><div className="relative flex-1"><Search size={18} className="absolute left-3 top-3 text-slate-400" /><input aria-label="搜索照片" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题、标签或拍摄地点…" className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm" /></div><div className="flex flex-wrap items-center gap-2"><label className="studio-photo-sort"><span>排序</span><select aria-label="照片排序" value={sort} onChange={event => { setSort(event.target.value as AdminPhotoSort); setPage(1); }}><option value="latest">最新上传</option><option value="likes">最多点赞</option><option value="views">最多浏览</option></select></label><label className="studio-thumbnail-slider"><span>缩略图</span><input aria-label="调整照片显示大小" type="range" min={THUMBNAIL_MIN} max={THUMBNAIL_MAX} step={THUMBNAIL_STEP} value={thumbnailSize} onChange={event => changeThumbnailSize(Number(event.target.value))} /><output>{thumbnailSize}px</output></label><button aria-expanded={filterOpen} onClick={() => setFilterOpen(value => !value)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${activeFilters ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-700'}`}><Filter size={17} />筛选{tags.length ? ` (${tags.length})` : ''}</button><div className="inline-flex rounded-xl border border-slate-300 p-1"><button aria-label="列表视图" aria-pressed={mode === 'list'} onClick={() => setMode('list')} className={`rounded-lg p-1.5 ${mode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}><List size={18} /></button><button aria-label="网格视图" aria-pressed={mode === 'grid'} onClick={() => setMode('grid')} className={`rounded-lg p-1.5 ${mode === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}><Grid2X2 size={18} /></button></div><button onClick={() => { setEditing(null); setModal('upload'); }} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white"><ImagePlus size={18} />上传照片</button></div></div>
    {filterOpen && <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><p className="text-sm font-semibold">筛选照片</p>{activeFilters && <button onClick={clear} className="inline-flex items-center gap-1 text-sm text-slate-500"><X size={15} />清除全部</button>}</div><div className="mt-4 grid gap-5 md:grid-cols-[180px_1fr]"><label className="text-sm">年份<select value={year || ''} onChange={event => { setYear(event.target.value ? Number(event.target.value) : null); setPage(1); }} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2"><option value="">全部年份</option>{availableYears.map(value => <option key={value}>{value}</option>)}</select></label><div><p className="text-sm">标签（需同时包含全部已选标签）</p><div className="mt-2 flex flex-wrap gap-2">{availableTags.map(value => <button key={value} aria-pressed={tags.includes(value)} onClick={() => toggleTag(value)} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm ${tags.includes(value) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-slate-600'}`}><Tag size={13} />{value}</button>)}</div></div></div></div>}
    <div className="flex items-end justify-between gap-3"><div><h2>图库内容 <span className="ml-1 font-sans text-sm text-slate-500">{total} 张照片</span></h2><p className="mt-1 text-sm text-slate-500">{loading ? '正在更新当前页…' : total ? `显示第 ${rangeStart}–${rangeEnd} 张` : '最近上传的照片会显示在前面'}</p></div>{loadError && <button onClick={() => setReloadVersion(value => value + 1)} className="text-sm text-red-700">加载失败，重新尝试</button>}</div>
    {!loading && loadError && items.length === 0 ? <div className="rounded-2xl border border-dashed border-red-200 bg-white px-6 py-16 text-center"><h3>无法加载照片</h3><p className="mt-2 text-sm text-slate-500">{loadError}</p></div> : items.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><ImagePlus className="mx-auto text-slate-300" size={36} /><h3 className="mt-4">{loading ? '正在整理照片…' : '没有符合条件的照片'}</h3>{!loading && <p className="mt-1 text-sm text-slate-500">调整筛选条件，或上传第一张照片。</p>}{activeFilters && !loading && <button onClick={clear} className="mt-4 text-sm text-blue-600">清除筛选</button>}</div> : mode === 'list' ? <div className={`studio-photo-list overflow-hidden border border-slate-200 bg-white ${loading ? 'opacity-60' : ''}`}><div className="studio-photo-table-heading studio-photo-row hidden gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs uppercase tracking-wide text-slate-500 md:grid"><span>预览</span><span>照片</span><span>年份</span><span>标签</span><span>互动</span><span>操作</span></div>{items.map(photo => <div key={photo.id} className="studio-photo-row grid gap-4 border-b border-slate-100 p-4 last:border-0"><div className="studio-photo-preview"><PhotoImage photo={photo} /></div><div><p className="studio-photo-title">{photo.title}</p><p className="mt-1 truncate text-xs text-slate-500">{photo.exif?.city || photo.exif?.province || '未填写拍摄地点'}</p></div><div className="text-sm text-slate-600">{photo.year}</div><div className="flex flex-wrap gap-1">{photo.tags.slice(0, 3).map(tag => <span key={tag} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{tag}</span>)}</div><div className="studio-photo-stats"><span aria-label={`点赞 ${photo.likesCount}`}><Heart size={14} />{photo.likesCount}</span><span aria-label={`浏览 ${photo.viewsCount}`}><Eye size={15} />{photo.viewsCount}</span></div><div className="flex gap-1"><button aria-label={`编辑 ${photo.title}`} onClick={() => { setEditing(photo); setModal('edit'); }} className="rounded-lg p-2 text-slate-500 hover:text-blue-600"><Edit3 size={17} /></button><button aria-label={`删除 ${photo.title}`} onClick={() => setDeleting(photo)} className="rounded-lg p-2 text-slate-500 hover:text-red-600"><Trash2 size={17} /></button></div></div>)}</div> : <div className={`studio-photo-grid ${loading ? 'opacity-60' : ''}`}>{items.map(photo => <article key={photo.id} className="studio-photo-card"><div className="studio-photo-frame"><PhotoImage photo={photo} /></div><div className="studio-photo-caption"><div><p className="studio-photo-title text-sm">{photo.title}</p><p className="mt-1 text-xs text-slate-500">{photo.year} · {photo.tags.length} 个标签</p><div className="studio-photo-stats is-grid"><span aria-label={`点赞 ${photo.likesCount}`}><Heart size={13} />{photo.likesCount}</span><span aria-label={`浏览 ${photo.viewsCount}`}><Eye size={14} />{photo.viewsCount}</span></div></div><button aria-label={`编辑 ${photo.title}`} onClick={() => { setEditing(photo); setModal('edit'); }} className="text-slate-500 hover:text-blue-600"><Edit3 size={16} /></button><button aria-label={`删除 ${photo.title}`} onClick={() => setDeleting(photo)} className="text-slate-500 hover:text-red-600"><Trash2 size={16} /></button></div></article>)}</div>}
    {total > 0 && <nav className="studio-pagination" aria-label="照片分页"><div className="studio-page-size"><label>每页 <select value={pageSize} onChange={event => changePageSize(Number(event.target.value) as PageSize)}>{PAGE_SIZES.map(value => <option key={value} value={value}>{value} 张</option>)}</select></label><span>{rangeStart}–{rangeEnd} / {total}</span></div><div className="studio-pagination-controls"><button aria-label="上一页" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} />上一页</button><div className="studio-pagination-pages">{pageTokens(page, totalPages).map(token => typeof token === 'number' ? <button key={token} aria-current={token === page ? 'page' : undefined} onClick={() => setPage(token)}>{token}</button> : <span key={token}>…</span>)}</div><span className="studio-pagination-mobile">{page} / {totalPages}</span><button aria-label="下一页" disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}>下一页<ChevronRight size={16} /></button></div></nav>}
    {notice && <div role="status" className="fixed bottom-5 right-5 z-[70] rounded-xl bg-slate-900 px-4 py-3 text-sm text-white">{notice}</div>}
    <PhotoModal isOpen={modal !== null} mode={modal || 'upload'} photo={editing} onClose={() => { setModal(null); setEditing(null); }} onUpload={upload} onUploadBatchComplete={completeUploadBatch} onUpdate={update} />
    {deleting && <ConfirmDialog title="删除照片？" description={`“${deleting.title}”及其展示图、缩略图将被永久删除，此操作不可恢复。`} onCancel={() => setDeleting(null)} onConfirm={() => void deletePhoto()} />}
  </section>;
}
