import React, { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { MasonryGallery } from './components/MasonryGallery';
import { photoService } from './services/photoService';
import { GallerySettings, settingsService } from './services/settingsService';
import { FilterState, Photo } from './types';

const AdminDashboard = lazy(() => import('./components/AdminDashboard').then(module => ({ default: module.AdminDashboard })));

function PublicGalleryPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [filter, setFilter] = useState<FilterState>({ year: null, tag: null });
  const [gallerySettings, setGallerySettings] = useState<GallerySettings>({ randomizePhotos: false, heroPhotoId: null, heroImageFit: 'contain' });
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    settingsService.getGallerySettings()
      .then(settings => { if (active) setGallerySettings(settings); })
      .catch(error => console.error('Failed to load gallery settings', error))
      .finally(() => { if (active) setSettingsLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    photoService.getPhotos({ year: filter.year || undefined, tag: filter.tag || undefined })
      .then(data => { if (active) setPhotos(data); })
      .catch(error => { console.error('Failed to load photos', error); if (active) setError('暂时无法连接画廊，请稍后重试。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filter, retryVersion]);

  return <div className="gallery-shell"><Navbar /><MasonryGallery photos={photos} loading={loading || settingsLoading} error={error} filter={filter} gallerySettings={gallerySettings} onFilterChange={next => setFilter(current => ({ ...current, ...next }))} onRetry={() => setRetryVersion(value => value + 1)} /></div>;
}

export default function App() {
  return <Router><Routes>
    <Route path="/" element={<PublicGalleryPage />} />
    <Route path="/admin" element={<Suspense fallback={<div className="min-h-screen grid place-items-center bg-slate-100 text-slate-500">正在加载控制台…</div>}><AdminDashboard /></Suspense>} />
  </Routes></Router>;
}
