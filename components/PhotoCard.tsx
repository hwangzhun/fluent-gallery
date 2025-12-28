import React, { useState, useEffect, useRef } from 'react';
import { Photo } from '../types';
import { Eye, Heart } from 'lucide-react';
import { likeService, viewService } from '../services';

interface PhotoCardProps {
  photo: Photo;
  onClick: () => void;
}

export const PhotoCard: React.FC<PhotoCardProps> = ({ photo, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [likesCount, setLikesCount] = useState(photo.likesCount || 0);
  const [isLiked, setIsLiked] = useState(photo.isLiked || likeService.isLiked(photo.id));
  const [isLiking, setIsLiking] = useState(false);
  const [likeAnimation, setLikeAnimation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewsCount, setViewsCount] = useState(photo.viewsCount || 0);
  const initRef = useRef(false);

  // 初始化点赞和浏览量状态（只执行一次）
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const initStatus = async () => {
      try {
        // 并行获取点赞和浏览量状态
        const [likeStatus, viewStatus] = await Promise.all([
          likeService.getLikeStatus(photo.id),
          viewService.getViewStatus(photo.id)
        ]);
        setLikesCount(likeStatus.likesCount);
        setIsLiked(likeStatus.liked);
        setViewsCount(viewStatus.viewsCount);
      } catch (error) {
        console.error('获取状态失败:', error);
        // 如果获取失败，使用本地缓存的状态
        const localLiked = likeService.isLiked(photo.id);
        setIsLiked(localLiked);
      }
    };
    initStatus();
  }, [photo.id]);

  // 处理卡片点击（记录浏览量）
  const handleCardClick = async () => {
    // 记录浏览量（静默失败，不影响用户体验）
    viewService.recordView(photo.id).then(result => {
      setViewsCount(result.viewsCount);
    }).catch(error => {
      // 静默失败，不影响用户体验
      console.error('记录浏览量失败:', error);
    });
    
    // 调用原始的 onClick
    onClick();
  };

  const handleLikeClick = async (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止触发卡片点击事件

    if (isLiking || isLiked) {
      return; // 如果正在点赞或已点赞，不处理
    }

    setIsLiking(true);
    setError(null);
    
    // 乐观更新：立即更新UI
    const previousCount = likesCount;
    const previousLiked = isLiked;
    setLikesCount(previousCount + 1);
    setIsLiked(true);
    setLikeAnimation(true);

    try {
      const result = await likeService.likePhoto(photo.id);
      setLikesCount(result.likesCount);
      setIsLiked(result.liked);
      
      // 点赞动画
      setTimeout(() => setLikeAnimation(false), 600);
    } catch (error: any) {
      console.error('点赞失败:', error);
      // 回滚乐观更新
      setLikesCount(previousCount);
      setIsLiked(previousLiked);
      setLikeAnimation(false);
      
      // 显示错误信息
      const errorMessage = error?.message || '点赞失败，请稍后重试';
      setError(errorMessage);
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsLiking(false);
    }
  };

  // Calculate dynamic height based on aspect ratio
  // Standard Masonry usually lets the image define height, but we can preset it to prevent layout shift if we wanted.
  // Here we let the image load naturally but use a placeholder.

  return (
    <div 
      className="relative break-inside-avoid mb-4 group cursor-pointer overflow-hidden rounded-xl bg-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-all duration-300 transform hover:-translate-y-1"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleCardClick}
    >
      {/* Placeholder / Loading State */}
      <div className={`transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
        <img
            src={photo.thumbnailUrl}
            alt={photo.title}
            className="w-full h-auto block"
            loading="lazy"
            onLoad={() => setIsLoaded(true)}
        />
      </div>

      {/* Overlay - Acrylic effect on hover */}
      <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4`}>
        <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
            <h3 className="text-white font-semibold text-lg truncate">{photo.title}</h3>
            <div className="flex items-center justify-between mt-1 text-gray-300 text-sm">
                <span>{photo.year}</span>
                <div className="flex items-center gap-3">
                    <button
                      onClick={handleLikeClick}
                      disabled={isLiking || isLiked}
                      className={`relative flex items-center gap-1 transition-all duration-200 ${
                        isLiked 
                          ? 'text-red-500 hover:text-red-400' 
                          : 'hover:text-white'
                      } ${isLiking ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${
                        likeAnimation ? 'scale-125' : ''
                      }`}
                      title={isLiked ? '已点赞' : isLiking ? '点赞中...' : '点赞'}
                    >
                      {isLiking && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin"></span>
                        </span>
                      )}
                      <Heart 
                        size={14} 
                        className={`transition-all duration-200 ${
                          isLiked ? 'fill-current' : ''
                        } ${likeAnimation ? 'animate-pulse' : ''} ${isLiking ? 'opacity-0' : 'opacity-100'}`}
                      />
                      <span className={`min-w-[1.5rem] text-right transition-all duration-200 ${
                        likeAnimation ? 'font-semibold' : ''
                      }`}>
                        {likesCount}
                      </span>
                    </button>
                    <span className="flex items-center gap-1 hover:text-white transition-colors">
                      <Eye size={14}/>
                      <span className="min-w-[1.5rem] text-right">{viewsCount}</span>
                    </span>
                </div>
                {error && (
                  <div className="absolute bottom-12 left-4 right-4 bg-red-500/90 text-white text-xs px-2 py-1 rounded animate-in fade-in slide-in-from-bottom-2">
                    {error}
                  </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};