import React, { useEffect, useMemo, useState } from 'react';
import { Check, Search, Sparkles, X } from 'lucide-react';
import type { Photo } from '../../types';
import { PhotoImage } from '../PhotoImage';

interface HeroPhotoPickerProps {
  open: boolean;
  photos: Photo[];
  selectedIds: string[];
  onClose: () => void;
  onConfirm: (photoIds: string[]) => void;
}

export function HeroPhotoPicker({ open, photos, selectedIds, onClose, onConfirm }: HeroPhotoPickerProps) {
  const [query, setQuery] = useState('');
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);

  useEffect(() => {
    if (!open) return;
    setDraftIds(selectedIds);
    setQuery('');
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [open, selectedIds, onClose]);

  const filteredPhotos = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return photos;
    return photos.filter(photo => [photo.title, String(photo.year), ...photo.tags].some(value => value.toLocaleLowerCase().includes(term)));
  }, [photos, query]);

  if (!open) return null;
  return (
    <div className="hero-picker-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="hero-picker-title" className="hero-picker-dialog">
        <header className="hero-picker-header">
          <div><p className="studio-eyebrow">HERO ARTWORK</p><h2 id="hero-picker-title">选择 Hero 封面图片</h2><p>可选择多张照片，每次进入首页随机展示一张。</p></div>
          <button type="button" onClick={onClose} aria-label="关闭 Hero 图片选择"><X size={20} /></button>
        </header>
        <div className="hero-picker-search">
          <Search size={17} aria-hidden="true" />
          <input autoFocus aria-label="搜索 Hero 候选图片" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题、年份或标签…" />
          <span>{filteredPhotos.length} 张</span>
        </div>
        <div className="hero-picker-grid" role="group" aria-label="Hero 封面图片">
          {!query && <button type="button" role="checkbox" aria-checked={draftIds.length === 0} className={`hero-picker-card hero-picker-auto ${draftIds.length === 0 ? 'is-selected' : ''}`} onClick={() => setDraftIds([])}>
            <span className="hero-picker-auto-art"><Sparkles size={28} strokeWidth={1.2} /></span>
            <span className="hero-picker-caption"><span><strong>自动选择</strong><small>优先最新横幅作品</small></span>{draftIds.length === 0 && <i><Check size={14} /></i>}</span>
          </button>}
          {filteredPhotos.map(photo => <button type="button" role="checkbox" aria-checked={draftIds.includes(photo.id)} key={photo.id} className={`hero-picker-card ${draftIds.includes(photo.id) ? 'is-selected' : ''}`} onClick={() => setDraftIds(current => current.includes(photo.id) ? current.filter(id => id !== photo.id) : [...current, photo.id])}>
            <span className="hero-picker-thumb"><PhotoImage photo={photo} /></span>
            <span className="hero-picker-caption"><span><strong>{photo.title}</strong><small>{photo.year}{photo.tags.length ? ` · ${photo.tags.slice(0, 2).join(' / ')}` : ''}</small></span>{draftIds.includes(photo.id) && <i><Check size={14} /></i>}</span>
          </button>)}
          {filteredPhotos.length === 0 && <div className="hero-picker-empty">没有匹配的照片，试试其他关键词。</div>}
        </div>
        <footer className="hero-picker-actions"><span>{draftIds.length === 0 ? '将由系统自动选择' : `已选择 ${draftIds.length} 幅作品`}</span><div><button type="button" onClick={onClose}>取消</button><button type="button" className="is-primary" onClick={() => { onConfirm(draftIds); onClose(); }}>确认选择</button></div></footer>
      </section>
    </div>
  );
}
