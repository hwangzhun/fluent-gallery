import { HERO_ASPECT_RATIOS, type HeroAspectRatio } from '../shared/hero';
import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Photo } from '../types';
import { PhotoImage } from './PhotoImage';

interface HeroArtworkProps {
  photo: Photo | null;
  fit: 'contain' | 'cover';
  aspectRatio?: HeroAspectRatio;
  positionX?: number;
  positionY?: number;
  scale?: number;
  loading?: boolean;
  preview?: boolean;
  original?: boolean;
  onOpen?: () => void;
  frameProps?: React.HTMLAttributes<HTMLDivElement>;
  frameRef?: React.Ref<HTMLDivElement>;
}

export function HeroArtwork({ photo, fit, aspectRatio = '4:3', positionX = 50, positionY = 50, scale = 1, loading = false, preview = false, original = true, onOpen, frameProps, frameRef }: HeroArtworkProps) {
  const positionStyle = {
    '--hero-position-x': `${positionX}%`,
    '--hero-position-y': `${positionY}%`,
    '--hero-image-scale': scale,
  } as React.CSSProperties;
  const frameClassName = `gallery-featured-frame is-${fit}${frameProps?.className ? ` ${frameProps.className}` : ''}`;
  const { className: _frameClassName, style: frameStyle, ...restFrameProps } = frameProps || {};
  const combinedStyle = { ...positionStyle, ...frameStyle };
  const artworkStyle = { '--hero-frame-ratio': HERO_ASPECT_RATIOS.find(item => item.value === aspectRatio)?.ratio || '4 / 3' } as React.CSSProperties;

  return (
    <div className={`gallery-hero-art${preview ? ' is-preview' : ''}`} style={artworkStyle}>
      <div className="gallery-hero-edition"><span>IN THE FRAME</span><span>{photo?.year ?? '光影之间'}</span></div>
      <figure>
        {photo ? onOpen ? (
          <button className={frameClassName} style={combinedStyle} onClick={onOpen} aria-label={`查看封面作品：${photo.title}`}>
            <PhotoImage key={photo.url} photo={photo} original={original} priority />
            <span className="gallery-featured-open"><ArrowUpRight size={18} /></span>
          </button>
        ) : (
          <div {...restFrameProps} ref={frameRef} className={frameClassName} style={combinedStyle}>
            <PhotoImage key={photo.url} photo={photo} original={original} priority />
          </div>
        ) : (
          <div className="gallery-featured-placeholder" aria-label={loading ? '正在准备展览' : '等待第一幅作品'}><span>{loading ? '正在准备展览' : '光影，静待发生。'}</span></div>
        )}
        <figcaption><span><i aria-hidden="true" />{photo ? photo.title : 'FLUENT GALLERY'}</span><span>{photo?.exif?.author || '光影中的日常'}</span></figcaption>
      </figure>
      <span className="gallery-hero-side-note" aria-hidden="true">A MOMENT, KEPT FOREVER.</span>
    </div>
  );
}
