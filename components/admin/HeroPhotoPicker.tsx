import React, { useEffect, useMemo, useState } from 'react';
import { Check, Search, Sparkles, X } from 'lucide-react';
import type { Photo } from '../../types';
import { PhotoImage } from '../PhotoImage';

interface HeroPhotoPickerProps {
  open: boolean;
  photos: Photo[];
  selectedId: string | null;
  onClose: () => void;
  onConfirm: (photoId: string | null) => void;
}

export function HeroPhotoPicker({ open, photos, selectedId, onClose, onConfirm }: HeroPhotoPickerProps) {
  const [query, setQuery] = useState('');
  const [draftId, setDraftId] = useState<string | null>(selectedId);

  useEffect(() => {
    if (!open) return;
    setDraftId(selectedId);
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
  }, [open, selectedId, onClose]);

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
          <div><p className="studio-eyebrow">HERO ARTWORK</p><h2 id="hero-picker-title">选择 Hero 封面图片</h2><p>通过缩略图查找并选择前台首屏作品。</p></div>
          <button type="button" onClick={onClose} aria-label="关闭 Hero 图片选择"><X size={20} /></button>
        </header>
        <div className="hero-picker-search">
          <Search size={17} aria-hidden="true" />
          <input autoFocus aria-label="搜索 Hero 候选图片" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题、年份或标签…" />
          <span>{filteredPhotos.length} 张</span>
        </div>
        <div className="hero-picker-grid" role="radiogroup" aria-label="Hero 封面图片">
          {!query && <button type="button" role="radio" aria-checked={draftId === null} className={`hero-picker-card hero-picker-auto ${draftId === null ? 'is-selected' : ''}`} onClick={() => setDraftId(null)}>
            <span className="hero-picker-auto-art"><Sparkles size={28} strokeWidth={1.2} /></span>
            <span className="hero-picker-caption"><span><strong>自动选择</strong><small>优先最新横幅作品</small></span>{draftId === null && <i><Check size={14} /></i>}</span>
          </button>}
          {filteredPhotos.map(photo => <button type="button" role="radio" aria-checked={draftId === photo.id} key={photo.id} className={`hero-picker-card ${draftId === photo.id ? 'is-selected' : ''}`} onClick={() => setDraftId(photo.id)}>
            <span className="hero-picker-thumb"><PhotoImage photo={photo} /></span>
            <span className="hero-picker-caption"><span><strong>{photo.title}</strong><small>{photo.year}{photo.tags.length ? ` · ${photo.tags.slice(0, 2).join(' / ')}` : ''}</small></span>{draftId === photo.id && <i><Check size={14} /></i>}</span>
          </button>)}
          {filteredPhotos.length === 0 && <div className="hero-picker-empty">没有匹配的照片，试试其他关键词。</div>}
        </div>
        <footer className="hero-picker-actions"><span>{draftId === null ? '将由系统自动选择' : '已选择一幅作品'}</span><div><button type="button" onClick={onClose}>取消</button><button type="button" className="is-primary" onClick={() => { onConfirm(draftId); onClose(); }}>确认选择</button></div></footer>
      </section>
    </div>
  );
}
