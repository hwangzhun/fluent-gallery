import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, RotateCcw } from 'lucide-react';
import { Navbar } from './Navbar';
import { Lightbox } from './Lightbox';
import { PhotoImage } from './PhotoImage';
import { albumService, type Album, type AlbumDetail } from '../api/albumService';
import { GalleryFooter } from './GalleryFooter';

export function AlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [opening, setOpening] = useState<string | null>(null);
  const [selected, setSelected] = useState<AlbumDetail | null>(null);
  const [index, setIndex] = useState(0);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const requestVersion = useRef(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    albumService.list().then(data => { if (active) setAlbums(data); })
      .catch(reason => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; requestVersion.current++; };
  }, [version]);
  const open = async (album: Album, button: HTMLButtonElement) => {
    const current = ++requestVersion.current;
    trigger.current = button; setOpening(album.id); setError('');
    try {
      const detail = await albumService.detail(album.id);
      if (current !== requestVersion.current) return;
      if (!detail.photos.length) throw new Error('画册暂时没有照片');
      setSelected(detail); setIndex(0);
    } catch (reason) { if (current === requestVersion.current) setError(reason instanceof Error ? reason.message : '无法打开画册'); }
    finally { if (current === requestVersion.current) setOpening(null); }
  };
  const close = () => { setSelected(null); requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })); };
  const sharePhoto = useCallback(async (photo: AlbumDetail['photos'][number]): Promise<'shared' | 'copied'> => {
    const shareUrl = new URL(window.location.href);
    shareUrl.hash = `/?photo=${encodeURIComponent(photo.id)}`;
    const data = {
      title: photo.title,
      text: `分享来自 Fluent Gallery 的摄影作品《${photo.title}》`,
      url: shareUrl.toString(),
    };
    if (typeof navigator.share === 'function') {
      await navigator.share(data);
      return 'shared';
    }
    if (!navigator.clipboard?.writeText) throw new Error('当前浏览器不支持分享或复制链接');
    await navigator.clipboard.writeText(shareUrl.toString());
    return 'copied';
  }, []);
  return <div className="gallery-shell"><Navbar /><main className="gallery-container albums-page">
    <div className="gallery-section-heading"><div><p className="gallery-eyebrow">PHOTO ALBUMS</p><h1>画册</h1></div><p className="gallery-count">{loading ? '正在整理画册…' : `${albums.length} 本画册`}</p></div>
    <p className="albums-intro">将流动的片刻编成篇章，循着时间慢慢看。</p>
    {error && <div className="gallery-empty" role="alert"><p>{error}</p><button onClick={() => setVersion(value => value + 1)}><RotateCcw size={14} />重新加载</button></div>}
    {loading ? <div className="albums-grid gallery-skeleton" role="status" aria-label="正在加载画册">{[0, 1, 2].map(i => <div key={i} className="gallery-skeleton-item" />)}</div> : !albums.length && !error ? <div className="gallery-empty"><h2>新的一册，静待展开。</h2><p>画册发布后将在这里呈现。</p></div> : <div className="albums-grid" aria-busy={Boolean(opening)}>
      {albums.map(album => <button key={album.id} className="album-card" onClick={event => void open(album, event.currentTarget)} aria-label={`打开画册：${album.name}，${album.photoCount} 张照片`} disabled={Boolean(opening)}>
        <span className="album-stack" aria-hidden="true">{album.previews.map((photo, i) => <span key={photo.id} className={`album-print album-print-${i}`}><PhotoImage photo={photo} /></span>)}</span>
        <span className="album-card-heading"><span>{album.name}</span><ArrowUpRight size={18} /></span>
        {album.description && <span className="album-description">{album.description}</span>}
        <span className="album-count">{opening === album.id ? '正在打开…' : `${album.photoCount} 张照片`}</span>
      </button>)}
    </div>}
  </main><GalleryFooter />{selected && <Lightbox photo={selected.photos[index]} albumName={selected.name} position={index + 1} total={selected.photos.length} hasPrev={index > 0} hasNext={index < selected.photos.length - 1} onPrev={() => setIndex(i => Math.max(0, i - 1))} onNext={() => setIndex(i => Math.min(selected.photos.length - 1, i + 1))} onClose={close} onShare={sharePhoto} />}</div>;
}
