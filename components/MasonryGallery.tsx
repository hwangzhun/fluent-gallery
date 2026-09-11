import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, LoaderCircle, RotateCcw } from 'lucide-react';
import { FilterState, Photo } from '../types';
import { PhotoCard } from './PhotoCard';
import { PhotoImage } from './PhotoImage';
import { Lightbox } from './Lightbox';
import { GalleryFilters } from './GalleryFilters';
import type { GallerySettings } from '../services/settingsService';
import { GalleryFooter } from './GalleryFooter';

interface MasonryGalleryProps {
  photos: Photo[];
  totalPhotos?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  configuredHero?: Photo | null;
  loading: boolean;
  error: string | null;
  filter: FilterState;
  gallerySettings: GallerySettings;
  sharedPhoto?: Photo | null;
  sharedPhotoError?: string | null;
  onFilterChange: (filter: Partial<FilterState>) => void;
  onLoadMore?: () => void;
  onRetry: () => void;
  onDismissSharedPhotoError?: () => void;
  onLightboxClose?: () => void;
}

function shufflePhotos(items: Photo[]): Photo[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[nextIndex]] = [shuffled[nextIndex], shuffled[index]];
  }
  return shuffled;
}

export const MasonryGallery: React.FC<MasonryGalleryProps> = ({ photos, totalPhotos, hasMore = false, loadingMore = false, configuredHero = null, sharedPhoto = null, sharedPhotoError = null, loading, error, filter, gallerySettings, onFilterChange, onLoadMore, onRetry, onDismissSharedPhotoError, onLightboxClose }) => {
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [displayPhotos, setDisplayPhotos] = useState<Photo[]>(photos);
  // Keep the opening artwork stable while visitors explore the collection filters.
  const [featured, setFeatured] = useState<Photo | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!loading && !error && filter.tag === null && filter.year === null) {
      setFeatured(current => {
        const configured = configuredHero ?? (gallerySettings.heroPhotoId ? photos.find(photo => photo.id === gallerySettings.heroPhotoId) : null);
        return configured ?? photos.find(photo => photo.id === current?.id) ?? photos.find(photo => photo.width >= photo.height) ?? photos[0] ?? null;
      });
    }
  }, [photos, configuredHero, loading, error, filter.tag, filter.year, gallerySettings.heroPhotoId]);
  useEffect(() => {
    setDisplayPhotos(gallerySettings.randomizePhotos && filter.tag === null && filter.year === null ? shufflePhotos(photos) : photos);
  }, [photos, filter.tag, filter.year, gallerySettings.randomizePhotos]);
  const selectedPhoto = displayPhotos.find(photo => photo.id === selectedPhotoId) ?? (featured?.id === selectedPhotoId ? featured : null) ?? (sharedPhoto?.id === selectedPhotoId ? sharedPhoto : null);
  const selectedIndex = displayPhotos.findIndex(photo => photo.id === selectedPhotoId);

  useEffect(() => {
    if (sharedPhoto) setSelectedPhotoId(sharedPhoto.id);
  }, [sharedPhoto]);

  const sharePhoto = useCallback(async (photo: Photo): Promise<'shared' | 'copied'> => {
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
    await navigator.clipboard.writeText(data.url);
    return 'copied';
  }, []);

  const closeLightbox = () => {
    setSelectedPhotoId(null);
    onLightboxClose?.();
  };

  useEffect(() => {
    if (!hasMore || loading || loadingMore || error || !onLoadMore || !loadMoreRef.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) onLoadMore();
    }, { rootMargin: '600px 0px' });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [error, hasMore, loading, loadingMore, onLoadMore]);

  return (
    <main>
      {sharedPhotoError && <div className="gallery-share-notice gallery-container" role="status"><span>{sharedPhotoError}</span><button type="button" onClick={onDismissSharedPhotoError}>关闭</button></div>}
      <section className="gallery-hero gallery-container" aria-labelledby="gallery-heading">
        <div className="gallery-hero-copy">
          <p className="gallery-eyebrow"><span /> A PERSONAL PHOTOGRAPHIC JOURNAL</p>
          <h1 id="gallery-heading">把日常，<br />留在<span className="gallery-title-accent">光</span>里。</h1>
          <p className="gallery-hero-english">The poetry of<br /><em>ordinary moments.</em></p>
          <p className="gallery-hero-description">一些走过的地方，一些停下的瞬间。<br />在光影之间，收藏日常的另一种模样。</p>
          <button className="gallery-explore" onClick={() => document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' })}>慢慢看，慢慢发现 <span><ArrowDown size={17} strokeWidth={1.3} /></span></button>
        </div>
        <div className="gallery-hero-art">
          <div className="gallery-hero-edition"><span>IN THE FRAME</span><span>{featured?.year ?? '光影之间'}</span></div>
          <figure>
            {featured ? <button className={`gallery-featured-frame is-${gallerySettings.heroImageFit}`} onClick={() => setSelectedPhotoId(featured.id)} aria-label={`查看封面作品：${featured.title}`}><PhotoImage key={featured.url} photo={featured} original priority /><span className="gallery-featured-open"><ArrowUpRight size={18} /></span></button> : <div className="gallery-featured-placeholder" aria-label={loading ? '正在准备展览' : '等待第一幅作品'}><span>{loading ? '正在准备展览' : '光影，静待发生。'}</span></div>}
            <figcaption><span><i aria-hidden="true" />{featured ? featured.title : 'FLUENT GALLERY'}</span><span>{featured?.exif?.author || '光影中的日常'}</span></figcaption>
          </figure>
          <span className="gallery-hero-side-note" aria-hidden="true">A MOMENT, KEPT FOREVER.</span>
        </div>
      </section>

      <section id="collection" className="gallery-collection gallery-container" aria-labelledby="collection-heading">
        <div className="gallery-section-heading"><div><p className="gallery-eyebrow">THE COLLECTION</p><h2 id="collection-heading">光影拾集 <span>Selected works</span></h2></div><p className="gallery-count" role="status">{loading ? '正在整理作品…' : error && photos.length === 0 ? '展览暂时未能载入' : <><span>{String(totalPhotos ?? photos.length).padStart(2, '0')}</span> 幅作品 · 每一幅，都是一次停留</>}</p></div>
        <GalleryFilters filter={filter} onFilterChange={onFilterChange} compact={compact} onCompactChange={setCompact} />
        <div aria-busy={loading}>
          {error && photos.length === 0 ? <div className="gallery-empty" role="alert"><p className="gallery-eyebrow">A LITTLE PAUSE</p><h3>展览暂时未能载入</h3><p>{error}</p><button onClick={onRetry}><RotateCcw size={14} />重新加载</button></div>
            : loading ? <div className="gallery-grid gallery-skeleton" aria-label="正在加载作品">{[0, 1, 2].map(index => <div key={index} className="gallery-skeleton-item" />)}</div>
              : photos.length === 0 ? <div className="gallery-empty"><p className="gallery-eyebrow">ROOM FOR SOMETHING NEW</p><h3>{filter.tag || filter.year ? '这一页，暂时留白。' : '等待第一束光。'}</h3><p>{filter.tag || filter.year ? '换一个主题或年份，继续寻找喜欢的瞬间。' : '作品上传后，将在这里慢慢展开。'}</p>{(filter.tag || filter.year) && <button onClick={() => onFilterChange({ year: null, tag: null })}>查看全部作品 <ArrowUpRight size={15} /></button>}</div>
                : <div className={`gallery-grid ${compact ? 'is-compact' : ''}`}>{displayPhotos.map((photo, index) => <PhotoCard key={photo.id} photo={photo} index={index} onClick={() => setSelectedPhotoId(photo.id)} />)}</div>}
        </div>
        {!loading && photos.length > 0 && hasMore && <div ref={loadMoreRef} className="gallery-load-more"><button type="button" onClick={onLoadMore} disabled={loadingMore}>{loadingMore ? <><LoaderCircle size={15} className="animate-spin" />正在展开更多作品…</> : '继续浏览'}</button>{error && <p role="status">{error}</p>}</div>}
        {!loading && !error && photos.length > 0 && !hasMore && <div className="gallery-endnote"><span /><p>目光停留的地方，故事还在继续。</p><span /></div>}
      </section>

      <GalleryFooter />

      {selectedPhoto && <Lightbox photo={selectedPhoto} onShare={sharePhoto} onClose={closeLightbox} onNext={() => { if (selectedIndex >= 0 && selectedIndex < displayPhotos.length - 1) setSelectedPhotoId(displayPhotos[selectedIndex + 1].id); }} onPrev={() => { if (selectedIndex > 0) setSelectedPhotoId(displayPhotos[selectedIndex - 1].id); }} hasNext={selectedIndex >= 0 && selectedIndex < displayPhotos.length - 1} hasPrev={selectedIndex > 0} position={selectedIndex >= 0 ? selectedIndex + 1 : undefined} total={displayPhotos.length} />}
    </main>
  );
};
