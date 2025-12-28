import React, { useEffect, useState } from 'react';
import { Photo } from '../types';
import { PhotoCard } from './PhotoCard';
import { Lightbox } from './Lightbox';

interface MasonryGalleryProps {
  photos: Photo[];
}

export const MasonryGallery: React.FC<MasonryGalleryProps> = ({ photos }) => {
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  // Close lightbox on escape key is handled in Lightbox component
  
  if (photos.length === 0) {
    return (
        <div className="flex flex-col items-center justify-center h-[50vh] text-gray-400">
            <p className="text-lg">未找到符合条件的照片。</p>
        </div>
    );
  }

  return (
    <>
      <div className="p-4 sm:p-6 lg:p-8">
        {/* CSS Columns Approach: Simple and effective for masonry */}
        <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
          {photos.map((photo, index) => (
            <PhotoCard 
                key={photo.id} 
                photo={photo} 
                onClick={() => setSelectedPhotoIndex(index)} 
            />
          ))}
        </div>
      </div>

      {selectedPhotoIndex !== null && (
        <Lightbox
          photo={photos[selectedPhotoIndex]}
          onClose={() => setSelectedPhotoIndex(null)}
          onNext={() => setSelectedPhotoIndex((prev) => (prev !== null && prev < photos.length - 1 ? prev + 1 : prev))}
          onPrev={() => setSelectedPhotoIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev))}
          hasNext={selectedPhotoIndex < photos.length - 1}
          hasPrev={selectedPhotoIndex > 0}
        />
      )}
    </>
  );
};