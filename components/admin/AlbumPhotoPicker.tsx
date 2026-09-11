import React, { useEffect, useState } from 'react';
import type { Photo } from '../../types';
import { photoService } from '../../services/photoService';
import { tagService } from '../../services/tagService';
import { PhotoImage } from '../PhotoImage';

export function AlbumPhotoPicker({ selected, onChange, disabled, onSessionExpired }: { selected: Photo[]; onChange: (photos: Photo[]) => void; disabled: boolean; onSessionExpired: () => void }) {
  const [items, setItems] = useState<Photo[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => { const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 250); return () => clearTimeout(timer); }, [query]);
  useEffect(() => {
    Promise.all([tagService.getAvailableYears(), tagService.getAllTagNames()]).then(([nextYears, nextTags]) => { setYears(nextYears); setAvailableTags(nextTags); }).catch(() => undefined);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    photoService.getAdminPhotos({ page, pageSize: 30, year: year ? Number(year) : undefined, tags, search, signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setItems(result.items); setPages(result.totalPages); } })
      .catch(reason => { if (reason.name !== 'AbortError') { setError(reason.message); if (/登录|会话|认证/.test(reason.message)) onSessionExpired(); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, year, tags, search, version, onSessionExpired]);
  const toggle = (photo: Photo) => onChange(selected.some(item => item.id === photo.id) ? selected.filter(item => item.id !== photo.id) : [...selected, photo]);
  return <section className="album-picker" aria-label="从照片库选片">
    <h3>从照片库选片</h3><p className="album-help">已选 {selected.length} 张 · 翻页和筛选保留选择</p>
    <div className="album-picker-filters"><input aria-label="搜索选片" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索照片、标签或地点" /><select aria-label="选片年份" value={year} onChange={event => { setYear(event.target.value); setPage(1); }}><option value="">全部年份</option>{years.map(value => <option key={value}>{value}</option>)}</select></div>
    <div className="album-picker-tags">{availableTags.map(tag => <label key={tag}><input type="checkbox" checked={tags.includes(tag)} onChange={event => { setTags(current => event.target.checked ? [...current, tag] : current.filter(value => value !== tag)); setPage(1); }} />{tag}</label>)}</div>
    {error && <p role="alert">{error} <button type="button" onClick={() => setVersion(v => v + 1)}>重试</button></p>}
    {loading ? <p role="status">正在加载照片…</p> : !error && !items.length ? <p>没有符合条件的照片。</p> : !error && <>
      <button type="button" disabled={disabled} onClick={() => onChange([...selected, ...items.filter(photo => !selected.some(item => item.id === photo.id))])}>选中当前页</button>
      <div className="album-picker-grid">{items.map(photo => <label key={photo.id}><PhotoImage photo={photo} /><span><input type="checkbox" disabled={disabled} checked={selected.some(item => item.id === photo.id)} onChange={() => toggle(photo)} aria-label={`加入画册：${photo.title}`} />{photo.title}</span></label>)}</div>
    </>}
    <div className="album-actions"><button type="button" disabled={loading || page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button><span>{page} / {Math.max(1, pages)}</span><button type="button" disabled={loading || page >= pages} onClick={() => setPage(p => p + 1)}>下一页</button></div>
  </section>;
}
