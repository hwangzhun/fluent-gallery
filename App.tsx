import React, { useEffect, useMemo, useState } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { MasonryGallery } from './components/MasonryGallery';
import { AdminDashboard } from './components/AdminDashboard';
import { photoService } from './services/photoService';
import { FilterState, Photo } from './types';

function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterState>({ year: null, tag: null });

  // Load photos on mount and when filter changes
  useEffect(() => {
    const loadPhotos = async () => {
      setLoading(true);
      try {
        const options: { year?: number; tag?: string } = {};
        if (filter.year) options.year = filter.year;
        if (filter.tag) options.tag = filter.tag;
        
        const data = await photoService.getPhotos(options);
        setPhotos(data);
      } catch (error) {
        console.error("Failed to load photos", error);
      } finally {
        setLoading(false);
      }
    };
    loadPhotos();
  }, [filter]);

  // Filter Logic (now handled by API, but keep for compatibility)
  const filteredPhotos = useMemo(() => {
    return photos;
  }, [photos]);

  const handleFilterChange = (newFilter: Partial<FilterState>) => {
    setFilter(prev => ({ ...prev, ...newFilter }));
  };

  const handleAddPhoto = async (photo: Photo) => {
    // 照片已通过 API 创建，重新加载列表
    try {
      const options: { year?: number; tag?: string } = {};
      if (filter.year) options.year = filter.year;
      if (filter.tag) options.tag = filter.tag;
      const data = await photoService.getPhotos(options);
      setPhotos(data);
    } catch (error) {
      console.error("Failed to reload photos", error);
    }
  };

  const handleDeletePhoto = async (id: string) => {
    try {
      await photoService.deletePhoto(id);
      // 重新加载列表
      const options: { year?: number; tag?: string } = {};
      if (filter.year) options.year = filter.year;
      if (filter.tag) options.tag = filter.tag;
      const data = await photoService.getPhotos(options);
      setPhotos(data);
    } catch (error) {
      console.error("Failed to delete photo", error);
    }
  };

  const handleUpdatePhoto = async (photo: Photo) => {
    // 照片已通过 API 更新，重新加载列表
    try {
      const options: { year?: number; tag?: string } = {};
      if (filter.year) options.year = filter.year;
      if (filter.tag) options.tag = filter.tag;
      const data = await photoService.getPhotos(options);
      setPhotos(data);
    } catch (error) {
      console.error("Failed to reload photos", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3f3f3]">
         <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-gray-500 font-light tracking-wide animate-pulse">加载图库中...</p>
         </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen pb-12">
        <Navbar filter={filter} onFilterChange={handleFilterChange} />
        
        <Routes>
          <Route path="/" element={<MasonryGallery photos={filteredPhotos} />} />
          <Route path="/admin" element={
            <AdminDashboard 
              photos={photos} 
              onAddPhoto={handleAddPhoto} 
              onDeletePhoto={handleDeletePhoto}
              onUpdatePhoto={handleUpdatePhoto}
            />
          } />
        </Routes>
      </div>
    </Router>
  );
}

export default App;