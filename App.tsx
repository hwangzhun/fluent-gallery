import { AlbumsPage } from './components/AlbumsPage';
import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { HashRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { MasonryGallery } from './components/MasonryGallery';
import { photoService } from './services/photoService';
import { GallerySettings, settingsService } from './services/settingsService';
import { FilterState, Photo } from './types';

const AdminDashboard = lazy(() => import('./components/AdminDashboard').then(module => ({ default: module.AdminDashboard })));

function PublicGalleryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [totalPhotos, setTotalPhotos] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [filter, setFilter] = useState<FilterState>({ year: null, tag: null });
  const [gallerySettings, setGallerySettings] = useState<GallerySettings>({ randomizePhotos: false, heroPhotoId: null, heroImageFit: 'contain' });
  const [configuredHero, setConfiguredHero] = useState<Photo | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const requestVersion = useRef(0);

  useEffect(() => {
    let active = true;
    settingsService.getGallerySettings()
      .then(async settings => {
        if (!active) return;
        setGallerySettings(settings);
        if (settings.heroPhotoId) {
          try {
            const hero = await photoService.getPhotoById(settings.heroPhotoId);
            if (active) setConfiguredHero(hero);
          } catch { if (active) setConfiguredHero(null); }
        }
      })
      .catch(error => console.error('Failed to load gallery settings', error))
      .finally(() => { if (active) setSettingsLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    settingsService.getSeoSettings().then(seo => {
      document.title = seo.title;
      const setMeta = (selector: string, content: string) => { const node = document.head.querySelector<HTMLMetaElement>(selector); if (node) node.content = content; };
      setMeta('meta[name="description"]', seo.description); setMeta('meta[name="keywords"]', seo.keywords); setMeta('meta[property="og:title"]', seo.ogTitle || seo.title); setMeta('meta[property="og:description"]', seo.ogDescription || seo.description); setMeta('meta[property="og:image"]', seo.ogImage);
      const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]'); if (canonical) canonical.href = seo.canonicalUrl;
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const version = ++requestVersion.current;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setPhotos([]);
    setNextCursor(null);
    setHasMore(false);
    photoService.getPublicPhotoPage({ limit: 50, year: filter.year || undefined, tag: filter.tag || undefined, signal: controller.signal })
      .then(page => {
        if (!active || version !== requestVersion.current) return;
        setPhotos(page.items);
        setTotalPhotos(page.total);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('Failed to load photos', error);
        if (active) setError('暂时无法连接画廊，请稍后重试。');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [filter, retryVersion]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || loading || loadingMore) return;
    const version = requestVersion.current;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await photoService.getPublicPhotoPage({ limit: 50, cursor: nextCursor, year: filter.year || undefined, tag: filter.tag || undefined });
      if (version !== requestVersion.current) return;
      setPhotos(current => {
        const existing = new Set(current.map(photo => photo.id));
        return [...current, ...page.items.filter(photo => !existing.has(photo.id))];
      });
      setTotalPhotos(page.total);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setError(null);
    } catch (error) {
      if (version === requestVersion.current) setError('加载更多作品失败，请重试。');
    } finally {
      if (version === requestVersion.current) setLoadingMore(false);
    }
  }, [filter, hasMore, loading, loadingMore, nextCursor]);

  useEffect(() => {
    const id = location.state?.scrollTo;
    if (!id || loading || settingsLoading) return;
    document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    navigate('/', { replace: true, state: null });
  }, [location.state, loading, settingsLoading, navigate]);

  return <div className="gallery-shell"><Navbar /><MasonryGallery photos={photos} totalPhotos={totalPhotos} hasMore={hasMore} loadingMore={loadingMore} configuredHero={configuredHero} loading={loading || settingsLoading} error={error} filter={filter} gallerySettings={gallerySettings} onLoadMore={loadMore} onFilterChange={next => setFilter(current => ({ ...current, ...next }))} onRetry={() => setRetryVersion(value => value + 1)} /></div>;
}

export default function App() {
  return <Router><Routes>
    <Route path="/" element={<PublicGalleryPage />} />
    <Route path="/albums" element={<AlbumsPage />} />
    <Route path="/admin" element={<Suspense fallback={<div className="min-h-screen grid place-items-center bg-slate-100 text-slate-500">正在加载控制台…</div>}><AdminDashboard /></Suspense>} />
  </Routes></Router>;
}
