import { albumService, type Album } from '../../api/albumService';
import { AlbumSelector } from './AlbumSelector';
import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, ChevronLeft, ChevronRight, Edit3, Eye, Filter, Grid2X2, Heart, ImagePlus, List, Search, Tag, Trash2, X } from 'lucide-react';
import { PhotoImage } from '../PhotoImage';
import { Photo } from '../../types';
import { photoService, type AdminPhotoSort, type BulkPhotoChanges } from '../../api/photoService';
import { tagService } from '../../api/tagService';
import { photoUploadService } from '../../api/photoUploadService';
import { PhotoModal, type BatchUploadResult, type PhotoFormData, type PhotoUploadData } from '../PhotoModal';
import { SelectMenu } from '../SelectMenu';

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

function BulkEditDialog({ count, onCancel, onSave, onDelete }: { count: number; onCancel: () => void; onSave: (changes: BulkPhotoChanges) => Promise<void>; onDelete: () => void }) {
  const [yearEnabled, setYearEnabled] = useState(false); const [year, setYear] = useState(String(new Date().getFullYear())); const [tagsEnabled, setTagsEnabled] = useState(false); const [tags, setTags] = useState(''); const [tagMode, setTagMode] = useState<'append' | 'remove' | 'replace'>('append'); const [exifEnabled, setExifEnabled] = useState<Record<string, boolean>>({}); const [exif, setExif] = useState<Record<string, string>>({}); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const fields = [['camera', '相机型号'], ['lens', '镜头'], ['author', '作者'], ['city', '城市'], ['province', '省份'], ['country', '国家']] as const;
  const submit = async () => { const next: BulkPhotoChanges = {}; if (yearEnabled) next.year = Number(year); if (tagsEnabled) next.tags = { mode: tagMode, values: tags.split(',').map(value => value.trim()).filter(Boolean) }; const selectedExif = Object.fromEntries(Object.entries(exif).filter(([key]) => exifEnabled[key])) as Record<string, string>; if (Object.keys(selectedExif).length) next.exif = selectedExif; if (!next.year && !next.tags && !next.exif) return setError('请勾选至少一个要修改的字段'); if (next.year && (!Number.isInteger(next.year) || next.year <= 0)) return setError('请填写有效年份'); setSaving(true); setError(''); try { await onSave(next); } catch (reason) { setError(reason instanceof Error ? reason.message : '批量更新失败'); } finally { setSaving(false); } };
  return <div role="dialog" aria-modal="true" aria-labelledby="bulk-edit-title" className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4"><div className="w-full max-w-xl rounded-2xl bg-white p-6"><h2 id="bulk-edit-title">批量修改 {count} 张照片</h2><p className="mt-2 text-sm text-slate-600">只有勾选的字段会写入；EXIF 会保留未勾选的信息。</p><div className="mt-5 space-y-4"><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={yearEnabled} onChange={event => setYearEnabled(event.target.checked)} />年份<input disabled={!yearEnabled} value={year} onChange={event => setYear(event.target.value)} type="number" className="ml-auto w-32 rounded border px-2 py-1.5" /></label><div className="rounded-lg border p-3"><div className="flex items-center gap-3 text-sm"><label className="inline-flex items-center gap-3"><input type="checkbox" checked={tagsEnabled} onChange={event => setTagsEnabled(event.target.checked)} />标签操作</label><SelectMenu disabled={!tagsEnabled} value={tagMode} onChange={setTagMode} ariaLabel="标签操作" className="ml-auto w-28" options={[{ value: 'append', label: '追加' }, { value: 'remove', label: '移除' }, { value: 'replace', label: '替换' }]} /></div><input disabled={!tagsEnabled} value={tags} onChange={event => setTags(event.target.value)} placeholder="用逗号分隔标签" className="mt-3 w-full rounded border px-3 py-2 text-sm" /></div><div className="rounded-lg border p-3"><p className="text-sm font-medium">EXIF</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{fields.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(exifEnabled[key])} onChange={event => setExifEnabled(current => ({ ...current, [key]: event.target.checked }))} />{label}<input disabled={!exifEnabled[key]} value={exif[key] || ''} onChange={event => setExif(current => ({ ...current, [key]: event.target.value }))} className="min-w-0 flex-1 rounded border px-2 py-1" /></label>)}</div></div></div>{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}<div className="mt-6 flex justify-between gap-3"><button onClick={onDelete} disabled={saving} className="rounded-xl border border-red-200 px-4 py-2 text-sm text-red-700">删除所选照片</button><div className="flex gap-3"><button onClick={onCancel} disabled={saving} className="rounded-xl border px-4 py-2 text-sm">取消</button><button onClick={() => void submit()} disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">{saving ? '正在保存…' : '应用修改'}</button></div></div></div></div>;
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
  const [sort, setSort] = useState<AdminPhotoSort>(() => (localStorage.getItem('fluent-gallery-admin-photo-sort') as AdminPhotoSort) || 'latest');
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);
  const [mode, setMode] = useState<Mode>(() => localStorage.getItem('fluent-gallery-admin-photo-mode') === 'grid' ? 'grid' : 'list');
  const [filterOpen, setFilterOpen] = useState(false);
  const [modal, setModal] = useState<'upload' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Photo | null>(null);
  const [deleting, setDeleting] = useState<Photo | null>(null);
  const [notice, setNotice] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [albumId, setAlbumId] = useState('');
  const [albumError, setAlbumError] = useState('');
  const [targetAlbums, setTargetAlbums] = useState<string[]>([]);
  const [addingAlbums, setAddingAlbums] = useState(false);
  useEffect(() => {
    let active = true;
    albumService.list(true).then(data => { if (active) { setAlbums(data); setAlbumError(''); } })
      .catch(reason => { if (active) { setAlbumError(reason.message); if (/登录|会话|认证/.test(reason.message)) onSessionExpired(); } });
    return () => { active = false; };
  }, [reloadVersion, onSessionExpired]);

  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query.trim()); setPage(1); }, 250); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => { tagService.getAvailableYears().then(setAvailableYears).catch(() => setAvailableYears([])); tagService.getAllTagNames().then(setAvailableTags).catch(() => setAvailableTags([])); }, [reloadVersion]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError('');
    photoService.getAdminPhotos({ page, pageSize, albumId: albumId || undefined, year: year || undefined, tags: tags.length ? tags : undefined, search: search || undefined, sort, signal: controller.signal })
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
  }, [page, pageSize, albumId, year, tags, search, sort, reloadVersion, onSessionExpired]);
  useEffect(() => { setSelectedIds(new Set()); }, [page, pageSize, albumId, year, tags, search, sort, reloadVersion]);

  const activeFilters = useMemo(() => Boolean(query || year || tags.length || albumId), [query, year, tags, albumId]);
  const clear = () => { setAlbumId(''); setQuery(''); setSearch(''); setYear(null); setTags([]); setPage(1); };
  const toggleTag = (value: string) => { setTags(current => current.includes(value) ? current.filter(tag => tag !== value) : [...current, value]); setPage(1); };
  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2600); };
  const upload = async (data: PhotoUploadData) => photoUploadService.uploadPhoto(data);
  const completeUploadBatch = async (result: BatchUploadResult) => { setPage(1); setReloadVersion(value => value + 1); showNotice(result.failed ? `已上传 ${result.succeeded} 张，${result.failed} 张失败` : `已上传 ${result.succeeded} 张照片`); };
  const update = async (id: string, data: PhotoFormData) => {
    await photoService.updatePhoto(id, { albumIds: data.albumIds, title: data.title, year: Number(data.year), tags: data.tags.split(',').map(tag => tag.trim()).filter(Boolean), exif: { camera: data.exif.camera || '', lens: data.exif.lens || '', aperture: data.exif.aperture || '', shutterSpeed: data.exif.shutterSpeed || '', iso: data.exif.iso || '', author: data.exif.author || '', copyright: data.exif.copyright || '', city: data.exif.city || '', province: data.exif.province || '', country: data.exif.country || '' } });
    setReloadVersion(value => value + 1); showNotice('照片已更新');
  };
  const toggleSelected = (id: string) => setSelectedIds(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleAll = () => setSelectedIds(current => current.size === items.length ? new Set() : new Set(items.map(item => item.id)));
  const addToAlbums = async () => {
    if (addingAlbums) return;
    setAddingAlbums(true); setAlbumError('');
    try { await albumService.addPhotos(targetAlbums, items.filter(item => selectedIds.has(item.id)).map(item => item.id)); setTargetAlbums([]); setReloadVersion(v => v + 1); showNotice('已加入画册，已有照片自动跳过'); }
    catch (reason) { const message = reason instanceof Error ? reason.message : '归册失败'; setAlbumError(message); if (/登录|会话|认证/.test(message)) onSessionExpired(); }
    finally { setAddingAlbums(false); }
  };
  const bulkUpdate = async (changes: BulkPhotoChanges) => { const updated = await photoService.batchUpdate([...selectedIds], changes); setBulkOpen(false); setSelectedIds(new Set()); setReloadVersion(value => value + 1); showNotice(`已更新 ${updated} 张照片`); };
  const bulkDelete = async () => { const { deleted, cleanupFailed } = await photoService.batchDelete([...selectedIds]); setBulkDeleting(false); setSelectedIds(new Set()); if (items.length === selectedIds.size && page > 1) setPage(value => value - 1); else setReloadVersion(value => value + 1); showNotice(`已删除 ${deleted} 张照片${cleanupFailed ? `，${cleanupFailed} 个存储文件待清理` : ''}`); };
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
    <div className="studio-photo-toolbar flex flex-col gap-4 border border-slate-200 bg-white p-4 xl:flex-row xl:items-center"><div className="relative flex-1"><Search size={18} className="absolute left-3 top-3 text-slate-400" /><input aria-label="搜索照片" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题、标签或拍摄地点…" className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm" /></div><div className="flex flex-wrap items-center gap-2"><label className="studio-photo-sort"><span>排序</span><SelectMenu ariaLabel="照片排序" value={sort} onChange={value => { setSort(value); localStorage.setItem('fluent-gallery-admin-photo-sort', value); setPage(1); }} options={[{ value: 'latest', label: '最新上传' }, { value: 'likes', label: '最多点赞' }, { value: 'views', label: '最多浏览' }]} /></label><label className="studio-thumbnail-slider"><span>缩略图</span><input aria-label="调整照片显示大小" type="range" min={THUMBNAIL_MIN} max={THUMBNAIL_MAX} step={THUMBNAIL_STEP} value={thumbnailSize} onChange={event => changeThumbnailSize(Number(event.target.value))} /><output>{thumbnailSize}px</output></label><button aria-expanded={filterOpen} onClick={() => setFilterOpen(value => !value)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${activeFilters ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-700'}`}><Filter size={17} />筛选{tags.length ? ` (${tags.length})` : ''}</button><div className="inline-flex rounded-xl border border-slate-300 p-1"><button aria-label="列表视图" aria-pressed={mode === 'list'} onClick={() => { setMode('list'); localStorage.setItem('fluent-gallery-admin-photo-mode', 'list'); }} className={`rounded-lg p-1.5 ${mode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}><List size={18} /></button><button aria-label="网格视图" aria-pressed={mode === 'grid'} onClick={() => { setMode('grid'); localStorage.setItem('fluent-gallery-admin-photo-mode', 'grid'); }} className={`rounded-lg p-1.5 ${mode === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}><Grid2X2 size={18} /></button></div><button onClick={() => { setEditing(null); setModal('upload'); }} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white"><ImagePlus size={18} />上传照片</button></div></div>
    {items.length > 0 && <div className="flex items-center justify-between border-y border-slate-200 py-3"><label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" aria-label="全选当前页照片" checked={selectedIds.size === items.length} ref={node => { if (node) node.indeterminate = selectedIds.size > 0 && selectedIds.size < items.length; }} onChange={toggleAll} />全选当前页</label><button onClick={() => setBulkOpen(true)} disabled={selectedIds.size === 0} aria-hidden={selectedIds.size === 0} tabIndex={selectedIds.size === 0 ? -1 : 0} className={`studio-bulk-edit-trigger inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white ${selectedIds.size > 0 ? 'is-visible' : ''}`}><CheckSquare size={16} />批量修改（{selectedIds.size}）</button></div>}
    {selectedIds.size > 0 && <div className="album-bulk"><span>将 {selectedIds.size} 张照片加入画册</span><AlbumSelector value={targetAlbums} onChange={setTargetAlbums} disabled={addingAlbums} /><button disabled={addingAlbums || loading || !targetAlbums.length} onClick={() => void addToAlbums()}>{addingAlbums ? '正在加入…' : '加入所选画册'}</button></div>}
    {albumError && <p role="alert">{albumError}<button onClick={() => setReloadVersion(v => v + 1)}>重试</button></p>}
    <label className="inline-flex items-center gap-3 text-sm">画册筛选<SelectMenu ariaLabel="筛选画册" value={albumId} onChange={value => { setAlbumId(value); setPage(1); }} options={[{ value: '', label: '全部画册' }, ...albums.map(album => ({ value: album.id, label: `${album.name}${album.published ? '' : ' · 草稿'}` }))]} /></label>
    {filterOpen && <div className="studio-filter-panel rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><p className="text-sm font-semibold">筛选照片</p>{activeFilters && <button onClick={clear} className="inline-flex items-center gap-1 text-sm text-slate-500"><X size={15} />清除全部</button>}</div><div className="mt-4 grid gap-5 md:grid-cols-[180px_1fr]"><label className="text-sm">年份<SelectMenu value={year || ''} onChange={value => { setYear(value === '' ? null : Number(value)); setPage(1); }} ariaLabel="筛选年份" className="mt-2 w-full" options={[{ value: '', label: '全部年份' }, ...availableYears.map(value => ({ value, label: String(value) }))]} /></label><div><p className="text-sm">标签（需同时包含全部已选标签）</p><div className="mt-2 flex flex-wrap gap-2">{availableTags.map(value => <button key={value} aria-pressed={tags.includes(value)} onClick={() => toggleTag(value)} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm ${tags.includes(value) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-slate-600'}`}><Tag size={13} />{value}</button>)}</div></div></div></div>}
    <div className="flex items-end justify-between gap-3"><div><h2>图库内容 <span className="ml-1 font-sans text-sm text-slate-500">{total} 张照片</span></h2><p className="mt-1 text-sm text-slate-500">{loading ? '正在更新当前页…' : total ? `显示第 ${rangeStart}–${rangeEnd} 张` : '最近上传的照片会显示在前面'}</p></div>{loadError && <button onClick={() => setReloadVersion(value => value + 1)} className="text-sm text-red-700">加载失败，重新尝试</button>}</div>
    {!loading && loadError && items.length === 0 ? <div className="rounded-2xl border border-dashed border-red-200 bg-white px-6 py-16 text-center"><h3>无法加载照片</h3><p className="mt-2 text-sm text-slate-500">{loadError}</p></div> : items.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><ImagePlus className="mx-auto text-slate-300" size={36} /><h3 className="mt-4">{loading ? '正在整理照片…' : '没有符合条件的照片'}</h3>{!loading && <p className="mt-1 text-sm text-slate-500">调整筛选条件，或上传第一张照片。</p>}{activeFilters && !loading && <button onClick={clear} className="mt-4 text-sm text-blue-600">清除筛选</button>}</div> : mode === 'list' ? <div className={`studio-photo-list overflow-hidden border border-slate-200 bg-white ${loading ? 'opacity-60' : ''}`}><div className="studio-photo-table-heading studio-photo-row hidden gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs uppercase tracking-wide text-slate-500 md:grid"><span>预览</span><span>照片</span><span>年份</span><span>标签</span><span>互动</span><span>操作</span></div>{items.map(photo => <div key={photo.id} className="studio-photo-row grid gap-4 border-b border-slate-100 p-4 last:border-0"><div className="studio-photo-preview"><label className="studio-photo-select"><input aria-label={`选择 ${photo.title}`} type="checkbox" checked={selectedIds.has(photo.id)} onChange={() => toggleSelected(photo.id)} /><PhotoImage photo={photo} /></label></div><div><p className="studio-photo-title">{photo.title}</p><p className="mt-1 truncate text-xs text-slate-500">{photo.exif?.city || photo.exif?.province || '未填写拍摄地点'}</p><p className="mt-1 text-xs text-slate-500 break-words">画册：{photo.albums?.map(album => album.name).join('、') || '未归册'}</p></div><div className="text-sm text-slate-600">{photo.year}</div><div className="flex flex-wrap gap-1">{photo.tags.slice(0, 3).map(tag => <span key={tag} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{tag}</span>)}</div><div className="studio-photo-stats"><span aria-label={`点赞 ${photo.likesCount}`}><Heart size={14} />{photo.likesCount}</span><span aria-label={`浏览 ${photo.viewsCount}`}><Eye size={15} />{photo.viewsCount}</span></div><div className="flex gap-1"><button aria-label={`编辑 ${photo.title}`} onClick={() => { setEditing(photo); setModal('edit'); }} className="rounded-lg p-2 text-slate-500 hover:text-blue-600"><Edit3 size={17} /></button><button aria-label={`删除 ${photo.title}`} onClick={() => setDeleting(photo)} className="rounded-lg p-2 text-slate-500 hover:text-red-600"><Trash2 size={17} /></button></div></div>)}</div> : <div className={`studio-photo-grid ${loading ? 'opacity-60' : ''}`}>{items.map(photo => <article key={photo.id} className="studio-photo-card"><div className="studio-photo-frame relative"><label className="studio-photo-select"><input aria-label={`选择 ${photo.title}`} type="checkbox" checked={selectedIds.has(photo.id)} onChange={() => toggleSelected(photo.id)} /></label><PhotoImage photo={photo} /></div><div className="studio-photo-caption"><div><p className="studio-photo-title text-sm">{photo.title}</p><p className="mt-1 text-xs text-slate-500">{photo.year} · {photo.tags.length} 个标签</p><p className="mt-1 text-xs text-slate-500 break-words">画册：{photo.albums?.map(album => album.name).join('、') || '未归册'}</p><div className="studio-photo-stats is-grid"><span aria-label={`点赞 ${photo.likesCount}`}><Heart size={13} />{photo.likesCount}</span><span aria-label={`浏览 ${photo.viewsCount}`}><Eye size={14} />{photo.viewsCount}</span></div></div><button aria-label={`编辑 ${photo.title}`} onClick={() => { setEditing(photo); setModal('edit'); }} className="text-slate-500 hover:text-blue-600"><Edit3 size={16} /></button><button aria-label={`删除 ${photo.title}`} onClick={() => setDeleting(photo)} className="text-slate-500 hover:text-red-600"><Trash2 size={16} /></button></div></article>)}</div>}
    {total > 0 && <nav className="studio-pagination" aria-label="照片分页"><div className="studio-page-size"><label>每页 <SelectMenu value={pageSize} onChange={value => changePageSize(value as PageSize)} ariaLabel="每页照片数量" options={PAGE_SIZES.map(value => ({ value, label: `${value} 张` }))} /></label><span>{rangeStart}–{rangeEnd} / {total}</span></div><div className="studio-pagination-controls"><button aria-label="上一页" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} />上一页</button><div className="studio-pagination-pages">{pageTokens(page, totalPages).map(token => typeof token === 'number' ? <button key={token} aria-current={token === page ? 'page' : undefined} onClick={() => setPage(token)}>{token}</button> : <span key={token}>…</span>)}</div><span className="studio-pagination-mobile">{page} / {totalPages}</span><button aria-label="下一页" disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}>下一页<ChevronRight size={16} /></button></div></nav>}
    {notice && <div role="status" className="studio-toast fixed bottom-5 right-5 z-[70] rounded-xl bg-slate-900 px-4 py-3 text-sm text-white">{notice}</div>}
    <PhotoModal isOpen={modal !== null} mode={modal || 'upload'} photo={editing} onClose={() => { setModal(null); setEditing(null); }} onUpload={upload} onUploadBatchComplete={completeUploadBatch} onUpdate={update} />
    {deleting && <ConfirmDialog title="删除照片？" description={`“${deleting.title}”及其展示图、缩略图将被永久删除，此操作不可恢复。`} onCancel={() => setDeleting(null)} onConfirm={() => void deletePhoto()} />}
    {bulkOpen && <BulkEditDialog count={selectedIds.size} onCancel={() => setBulkOpen(false)} onSave={bulkUpdate} onDelete={() => { setBulkOpen(false); setBulkDeleting(true); }} />}
    {bulkDeleting && <ConfirmDialog title={`删除 ${selectedIds.size} 张照片？`} description="所选照片的原图、缩略图和记录都会被永久删除，此操作不可恢复。" onCancel={() => setBulkDeleting(false)} onConfirm={() => void bulkDelete()} />}
  </section>;
}
