import { getHeroImages, legacyHeroImage } from '../shared/hero';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, LoaderCircle, RotateCcw } from 'lucide-react';
import { FilterState, Photo } from '../types';
import { PhotoCard } from './PhotoCard';
import { Lightbox } from './Lightbox';
import { GalleryFilters } from './GalleryFilters';
import type { GallerySettings } from '../api/settingsService';
import { GalleryFooter } from './GalleryFooter';
import { HeroArtwork } from './HeroArtwork';
import { analytics, type InteractionSource } from '../api/analyticsService';

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
  const [selectedSource, setSelectedSource] = useState<InteractionSource>('gallery');
  const [compact, setCompact] = useState(() => window.matchMedia?.('(max-width: 700px)').matches ?? window.innerWidth <= 700);
  const [displayPhotos, setDisplayPhotos] = useState<Photo[]>(photos);
  // Keep the opening artwork stable while visitors explore the collection filters.
  const [featured, setFeatured] = useState<Photo | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (configuredHero) { setFeatured(configuredHero); return; }
    if (!loading && !error && filter.tag === null && filter.year === null) {
      setFeatured(current => {
        const configured = configuredHero ?? (gallerySettings.heroImages === undefined && gallerySettings.heroPhotoId ? photos.find(photo => photo.id === gallerySettings.heroPhotoId) : null);
        return configured ?? current ?? photos.find(photo => photo.width >= photo.height) ?? photos[0] ?? null;
      });
    }
  }, [photos, configuredHero, loading, error, filter.tag, filter.year, gallerySettings.heroPhotoId]);
  useEffect(() => {
    setDisplayPhotos(gallerySettings.randomizePhotos && filter.tag === null && filter.year === null ? shufflePhotos(photos) : photos);
  }, [photos, filter.tag, filter.year, gallerySettings.randomizePhotos]);
  const selectedPhoto = displayPhotos.find(photo => photo.id === selectedPhotoId) ?? (featured?.id === selectedPhotoId ? featured : null) ?? (sharedPhoto?.id === selectedPhotoId ? sharedPhoto : null);
  const selectedIndex = displayPhotos.findIndex(photo => photo.id === selectedPhotoId);
  const heroView = getHeroImages(gallerySettings).find(image => image.photoId === featured?.id)
    ?? legacyHeroImage(gallerySettings, featured?.id || '');
  const heroPositionX = heroView.fit === 'cover' ? heroView.positionX : 50;
  const heroPositionY = heroView.fit === 'cover' ? heroView.positionY : 50;
  const heroImageScale = heroView.fit === 'cover' ? heroView.scale : 1;

  useEffect(() => {
    if (sharedPhoto) {
      setSelectedSource('shared_link');
      setSelectedPhotoId(sharedPhoto.id);
      analytics.selectContent('photo', sharedPhoto.id, 'shared_link');
    }
  }, [sharedPhoto]);

  const openPhoto = (photo: Photo, source: InteractionSource, position?: number) => {
    analytics.selectContent('photo', photo.id, source, { content_position: position });
    setSelectedSource(source);
    setSelectedPhotoId(photo.id);
  };

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
      if (entries.some(entry => entry.isIntersecting)) { analytics.loadMore('automatic'); onLoadMore(); }
    }, { rootMargin: '600px 0px' });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [error, hasMore, loading, loadingMore, onLoadMore]);

  return (
    <main>
      {sharedPhotoError && <div className="gallery-share-notice gallery-container" role="status"><span>{sharedPhotoError}</span><button type="button" onClick={onDismissSharedPhotoError}>关闭</button></div>}
      <section className="gallery-hero gallery-container" aria-labelledby="gallery-heading">
        <div className="gallery-hero-copy">
          <p className="gallery-eyebrow"><span /> FLUENT / A PHOTOGRAPHIC JOURNAL</p>
          <h1 id="gallery-heading">让光影，<br />继续<span className="gallery-title-accent">流动</span>。</h1>
          <p className="gallery-hero-english">Images in motion.<br /><em>Moments held still.</em></p>
          <p className="gallery-hero-description">光线经过，时间经过，生活也不断向前。<br />Fluent 收集那些自然发生、稍纵即逝的片刻——<br />关于城市、街道、人与日常。</p>
          <button className="gallery-explore" onClick={() => { analytics.navigation('collection', 'hero_cta'); document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' }); }}>循光而行 <span><ArrowDown size={17} strokeWidth={1.3} /></span></button>
        </div>
        <HeroArtwork photo={featured} fit={heroView.fit} aspectRatio={heroView.aspectRatio} positionX={heroPositionX} positionY={heroPositionY} scale={heroImageScale} loading={loading} onOpen={featured ? () => openPhoto(featured, 'hero') : undefined} />
      </section>

      <section id="collection" className="gallery-collection gallery-container" aria-labelledby="collection-heading">
        <div className="gallery-section-heading"><div><p className="gallery-eyebrow">THE COLLECTION</p><h2 id="collection-heading">光影拾集 <span>Selected works</span></h2></div><p className="gallery-count" role="status">{loading ? '正在整理作品…' : error && photos.length === 0 ? '展览暂时未能载入' : <><span>{String(totalPhotos ?? photos.length).padStart(2, '0')}</span> 幅作品 · 每一幅，都是一次停留</>}</p></div>
        <GalleryFilters filter={filter} onFilterChange={onFilterChange} compact={compact} onCompactChange={setCompact} />
        <div className={`gallery-results ${loading && photos.length > 0 ? 'is-updating' : ''}`} aria-busy={loading}>
          {error && photos.length === 0 ? <div className="gallery-empty" role="alert"><p className="gallery-eyebrow">A LITTLE PAUSE</p><h3>展览暂时未能载入</h3><p>{error}</p><button onClick={() => { analytics.contentRetry('gallery'); onRetry(); }}><RotateCcw size={14} />重新加载</button></div>
            : loading && photos.length === 0 ? <div className="gallery-grid gallery-skeleton" aria-label="正在加载作品">{[0, 1, 2].map(index => <div key={index} className="gallery-skeleton-item" />)}</div>
              : photos.length === 0 ? <div className="gallery-empty"><p className="gallery-eyebrow">ROOM FOR SOMETHING NEW</p><h3>{filter.tag || filter.year ? '这一页，暂时留白。' : '等待第一束光。'}</h3><p>{filter.tag || filter.year ? '换一个主题或年份，继续寻找喜欢的瞬间。' : '作品上传后，将在这里慢慢展开。'}</p>{(filter.tag || filter.year) && <button onClick={() => { analytics.galleryFilter('all', 'all'); onFilterChange({ year: null, tag: null }); }}>查看全部作品 <ArrowUpRight size={15} /></button>}</div>
                : <div className={`gallery-grid ${compact ? 'is-compact' : ''}`}>{displayPhotos.map((photo, index) => <PhotoCard key={photo.id} photo={photo} index={index} onClick={() => openPhoto(photo, 'gallery', index + 1)} />)}</div>}
        </div>
        {!loading && photos.length > 0 && hasMore && <div ref={loadMoreRef} className="gallery-load-more"><button type="button" onClick={() => { if (error) analytics.contentRetry('load_more'); else analytics.loadMore('button'); onLoadMore?.(); }} disabled={loadingMore}>{loadingMore ? <><LoaderCircle size={15} className="animate-spin" />正在展开更多作品…</> : '继续浏览'}</button>{error && <p role="status">{error}</p>}</div>}
        {!loading && !error && photos.length > 0 && !hasMore && <div className="gallery-endnote"><span /><p>目光停留的地方，故事还在继续。</p><span /></div>}
      </section>

      <GalleryFooter />

      {selectedPhoto && <Lightbox photo={selectedPhoto} analyticsSource={selectedSource} onShare={sharePhoto} onClose={closeLightbox} onNext={() => { if (selectedIndex >= 0 && selectedIndex < displayPhotos.length - 1) setSelectedPhotoId(displayPhotos[selectedIndex + 1].id); }} onPrev={() => { if (selectedIndex > 0) setSelectedPhotoId(displayPhotos[selectedIndex - 1].id); }} hasNext={selectedIndex >= 0 && selectedIndex < displayPhotos.length - 1} hasPrev={selectedIndex > 0} position={selectedIndex >= 0 ? selectedIndex + 1 : undefined} total={displayPhotos.length} />}
    </main>
  );
};
