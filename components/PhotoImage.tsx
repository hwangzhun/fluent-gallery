import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { Photo } from '../types';

interface PhotoImageProps {
  photo: Photo;
  original?: boolean;
  priority?: boolean;
}

export const PhotoImage: React.FC<PhotoImageProps> = ({ photo, original = false, priority = false }) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <span className={`artwork-image ${loaded ? 'is-loaded' : ''} ${failed ? 'has-error' : ''}`} style={{ aspectRatio: `${photo.width || 3} / ${photo.height || 2}` }}>
      {failed ? (
        <span className="artwork-image-error"><ImageOff size={22} strokeWidth={1} />作品暂时无法加载</span>
      ) : (
        <img
          src={original ? photo.url : photo.thumbnailUrl}
          alt={photo.title}
          width={photo.width || undefined}
          height={photo.height || undefined}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
};
