import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Heart } from 'lucide-react';
import { Photo } from '../types';
import { likeService } from '../api';
import { PhotoImage } from './PhotoImage';

interface PhotoCardProps {
  photo: Photo;
  index: number;
  onClick: () => void;
}

export const PhotoCard: React.FC<PhotoCardProps> = ({ photo, index, onClick }) => {
  const [likes, setLikes] = useState(photo.likesCount || 0);
  const [liked, setLiked] = useState(photo.isLiked || likeService.isLiked(photo.id));
  const [liking, setLiking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    likeService.getLikeStatus(photo.id).then(status => {
      if (active) { setLikes(status.likesCount); setLiked(status.liked); }
    }).catch(() => {});
    return () => { active = false; };
  }, [photo.id]);

  const handleLike = async () => {
    if (liked || liking) return;
    setLiking(true);
    setError(null);
    setLikes(likes + 1);
    setLiked(true);
    try {
      const result = await likeService.likePhoto(photo.id);
      setLikes(result.likesCount);
      setLiked(result.liked);
    } catch {
      setLikes(likes);
      setLiked(false);
      setError('暂时无法点赞，请重试。');
    } finally { setLiking(false); }
  };

  return (
    <figure className="gallery-artwork">
      <button className="gallery-artwork-open" onClick={onClick} aria-label={`查看作品：${photo.title}`}>
        <PhotoImage key={photo.thumbnailUrl} photo={photo} />
        <span className="gallery-artwork-view" aria-hidden="true"><ArrowUpRight size={18} strokeWidth={1.3} /></span>
      </button>
      <figcaption className="gallery-artwork-caption">
        <span className="gallery-artwork-number">{String(index + 1).padStart(2, '0')}</span>
        <div className="gallery-artwork-title"><h3><button onClick={onClick}>{photo.title}</button></h3><p>{photo.year}{photo.tags.length > 0 && ` · ${photo.tags.join(' / ')}`}</p></div>
        <button className={`gallery-like ${liked ? 'is-liked' : ''}`} onClick={handleLike} disabled={liking || liked} aria-label={liked ? `已喜欢 ${photo.title}，${likes} 次喜欢` : `喜欢 ${photo.title}`} aria-pressed={liked}>
          <Heart size={14} strokeWidth={1.3} fill={liked ? 'currentColor' : 'none'} /><span>{likes}</span>
        </button>
      </figcaption>
      {error && <p className="gallery-inline-error" role="status">{error}</p>}
    </figure>
  );
};
