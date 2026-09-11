import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Info, Heart, Eye } from 'lucide-react';
import { Photo } from '../types';
import { likeService, viewService } from '../services';
import { PhotoImage } from './PhotoImage';

interface LightboxProps {
  photo: Photo;
  albumName?: string;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  position?: number;
  total?: number;
}

const ArtworkDetails: React.FC<{ photo: Photo }> = ({ photo }) => {
  const [likes, setLikes] = useState(photo.likesCount || 0);
  const [liked, setLiked] = useState(photo.isLiked || likeService.isLiked(photo.id));
  const [views, setViews] = useState(photo.viewsCount || 0);
  const [liking, setLiking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    likeService.getLikeStatus(photo.id).then(status => {
      if (active) { setLikes(status.likesCount); setLiked(status.liked); }
    }).catch(() => {});
    viewService.getViewStatus(photo.id).then(status => {
      if (active) setViews(status.viewsCount);
    }).catch(() => {});
    const timer = window.setTimeout(() => {
      viewService.recordView(photo.id).then(status => {
        if (active) setViews(status.viewsCount);
      }).catch(() => {});
    }, 1000);
    return () => { active = false; window.clearTimeout(timer); };
  }, [photo.id]);
  const like = async () => {
    if (liked || liking) return;
    setLiking(true);
    setError(null);
    try {
      const result = await likeService.likePhoto(photo.id);
      setLikes(result.likesCount);
      setLiked(result.liked);
    } catch { setError('暂时无法点赞，请重试。'); }
    finally { setLiking(false); }
  };
  const location = [photo.exif?.country, photo.exif?.province, photo.exif?.city].filter(Boolean).join(' · ');
  const details = [
    ['年份', String(photo.year)], ['摄影', photo.exif?.author], ['地点', location],
    ['相机', photo.exif?.camera], ['镜头', photo.exif?.lens],
    ['曝光', [photo.exif?.aperture, photo.exif?.shutterSpeed, photo.exif?.iso].filter(Boolean).join(' · ')],
    ['尺寸', `${photo.width} × ${photo.height} px`], ['版权', photo.exif?.copyright],
  ];
  return (
    <div className="lightbox-details-content">
      <p className="gallery-eyebrow">BEHIND THE FRAME</p><h2>{photo.title}</h2>
      {photo.description && <p className="lightbox-description">{photo.description}</p>}
      <dl>{details.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {photo.tags.length > 0 && <p className="lightbox-tags">{photo.tags.join(' / ')}</p>}
      <div className="lightbox-stats"><button onClick={like} disabled={liked || liking} aria-pressed={liked} aria-label={liked ? '已喜欢这幅作品' : '喜欢这幅作品'}><Heart size={16} fill={liked ? 'currentColor' : 'none'} />{likes}</button><span><Eye size={16} />{views}</span></div>
      {error && <p role="status" className="gallery-inline-error">{error}</p>}
    </div>
  );
};

export const Lightbox: React.FC<LightboxProps> = ({ photo, onClose, onNext, onPrev, hasNext, hasPrev, position, total, albumName }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [showInfo, setShowInfo] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className={`gallery-lightbox ${showInfo ? 'with-info' : ''}`}
      aria-label={`作品：${photo.title}`}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => {
        if (event.key === 'ArrowRight' && hasNext) { event.preventDefault(); onNext(); }
        if (event.key === 'ArrowLeft' && hasPrev) { event.preventDefault(); onPrev(); }
      }}
    >
      <header className="lightbox-toolbar"><span className={`lightbox-brand ${albumName ? 'is-album' : ''}`}>Fluent Gallery<span> / {albumName || '作品展映'}</span></span><div><button onClick={() => setShowInfo(value => !value)} aria-label="作品信息" aria-expanded={showInfo} aria-controls="artwork-details"><Info size={19} strokeWidth={1.4} /></button><button onClick={onClose} aria-label="关闭大图" autoFocus><X size={22} strokeWidth={1.4} /></button></div></header>
      <div className="lightbox-stage" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
        <button className="lightbox-previous" disabled={!hasPrev} onClick={onPrev} aria-label="上一幅作品"><ChevronLeft size={25} strokeWidth={1.2} /></button>
        <div className="lightbox-photo" onTouchStart={event => { const touch = event.touches[0]; touchStart.current = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null; }} onTouchEnd={event => {
          const start = touchStart.current; touchStart.current = null;
          const end = event.changedTouches[0];
          if (!start || !end || Math.abs(end.clientX - start.x) < 60 || Math.abs(end.clientY - start.y) > Math.abs(end.clientX - start.x) / 2) return;
          if (end.clientX < start.x && hasNext) onNext();
          if (end.clientX > start.x && hasPrev) onPrev();
        }}><PhotoImage key={photo.id} photo={photo} original priority /></div>
        <button className="lightbox-next" disabled={!hasNext} onClick={onNext} aria-label="下一幅作品"><ChevronRight size={25} strokeWidth={1.2} /></button>
      </div>
      <div className="lightbox-caption"><div><h2>{photo.title}</h2><p>{photo.year}{photo.exif?.author && ` · ${photo.exif.author}`}</p></div><span>{position ? `${String(position).padStart(2, '0')} / ${String(total).padStart(2, '0')}` : '封面作品'}</span><p className="lightbox-keyboard-hint">← → 切换作品 · ESC 返回</p></div>
      <aside id="artwork-details" className="lightbox-details" hidden={!showInfo}><ArtworkDetails key={photo.id} photo={photo} /></aside>
    </dialog>
  );
};
