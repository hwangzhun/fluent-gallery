import React, { useEffect, useState, useRef } from 'react';
import { Photo } from '../types';
import { X, ChevronLeft, ChevronRight, Info, Calendar, Camera, Aperture, Maximize2, User, Copyright, MapPin, Heart, Eye } from 'lucide-react';
import { likeService, viewService } from '../services';

interface LightboxProps {
  photo: Photo;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
}

export const Lightbox: React.FC<LightboxProps> = ({ photo, onClose, onNext, onPrev, hasNext, hasPrev }) => {
  const [showInfo, setShowInfo] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [likesCount, setLikesCount] = useState(photo.likesCount || 0);
  const [isLiked, setIsLiked] = useState(photo.isLiked || likeService.isLiked(photo.id));
  const [isLiking, setIsLiking] = useState(false);
  const [likeAnimation, setLikeAnimation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewsCount, setViewsCount] = useState(photo.viewsCount || 0);
  const viewRecordedRef = useRef(false);

  // 初始化点赞和浏览量状态
  useEffect(() => {
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

  // 记录浏览量（Lightbox 打开时）
  useEffect(() => {
    if (viewRecordedRef.current) return;
    viewRecordedRef.current = true;

    // 延迟记录，确保用户真的在查看照片
    const timer = setTimeout(() => {
      viewService.recordView(photo.id).then(result => {
        setViewsCount(result.viewsCount);
      }).catch(error => {
        // 静默失败，不影响用户体验
        console.error('记录浏览量失败:', error);
      });
    }, 1000); // 1秒后记录，确保用户真的在查看

    return () => {
      clearTimeout(timer);
    };
  }, [photo.id]);

  const handleLikeClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (isLiking || isLiked) {
      return;
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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && hasNext) onNext();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNext, onPrev, hasNext, hasPrev]);

  // Reset loading state when photo changes
  useEffect(() => {
    setIsLoaded(false);
    viewRecordedRef.current = false; // 重置浏览量记录标记，允许新照片记录浏览量
  }, [photo.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Controls Overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-50 text-white/90">
        <div className="text-sm font-light tracking-wide opacity-80 hidden sm:block">
          {photo.title}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handleLikeClick}
              disabled={isLiking || isLiked}
              className={`relative p-2 rounded-full hover:bg-white/10 transition-all duration-200 ${
                isLiked 
                  ? 'text-red-500 hover:text-red-400 bg-white/10' 
                  : ''
              } ${isLiking ? 'opacity-50 cursor-not-allowed' : ''} ${
                likeAnimation ? 'scale-110' : ''
              }`}
              title={isLiked ? '已点赞' : isLiking ? '点赞中...' : '点赞'}
            >
              {isLiking && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="w-4 h-4 border border-white/30 border-t-white rounded-full animate-spin"></span>
                </span>
              )}
              <Heart 
                size={24} 
                className={`transition-all duration-200 ${
                  isLiked ? 'fill-current' : ''
                } ${likeAnimation ? 'animate-pulse' : ''} ${isLiking ? 'opacity-0' : 'opacity-100'}`}
              />
            </button>
            <span className={`text-white/90 text-sm min-w-[2rem] transition-all duration-200 ${
              likeAnimation ? 'scale-110 text-red-400' : ''
            }`}>
              {likesCount}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Eye size={20} className="text-white/70" />
            <span className="text-white/90 text-sm min-w-[2rem]">{viewsCount}</span>
          </div>
          {error && (
            <div className="absolute top-16 right-4 bg-red-500/90 text-white text-xs px-3 py-2 rounded animate-in fade-in slide-in-from-top-2 z-50">
              {error}
            </div>
          )}
          <button 
            onClick={() => setShowInfo(!showInfo)} 
            className={`p-2 rounded-full hover:bg-white/10 transition-colors ${showInfo ? 'bg-white/20' : ''}`}
            title="切换信息"
          >
            <Info size={24} />
          </button>
          <button 
            onClick={onClose} 
            className="p-2 rounded-full hover:bg-white/10 transition-colors hover:text-red-400"
            title="关闭"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Navigation Buttons */}
      {hasPrev && (
        <button 
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 p-3 rounded-full bg-black/20 hover:bg-white/10 text-white transition-all z-40 hidden sm:flex"
        >
          <ChevronLeft size={32} />
        </button>
      )}
      
      {hasNext && (
        <button 
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 p-3 rounded-full bg-black/20 hover:bg-white/10 text-white transition-all z-40 hidden sm:flex"
        >
          <ChevronRight size={32} />
        </button>
      )}

      {/* Main Image Container */}
      <div 
        className="relative w-full h-full flex items-center justify-center p-0 sm:p-4 md:p-8"
        onClick={onClose} // Clicking background closes
      >
        <div 
            className="relative max-w-full max-h-full transition-all duration-500 ease-out"
            onClick={(e) => e.stopPropagation()} // Clicking image doesn't close
        >
            {!isLoaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                </div>
            )}
            <img
            src={photo.url}
            alt={photo.title}
            className={`max-w-full max-h-[90vh] object-contain shadow-2xl transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setIsLoaded(true)}
            />
        </div>
      </div>

      {/* Info Panel - Sliding from right */}
      <div className={`absolute top-0 right-0 h-full w-80 bg-white/10 backdrop-blur-xl border-l border-white/10 p-6 text-white transform transition-transform duration-300 ease-out z-40 overflow-y-auto no-scrollbar ${showInfo ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="mt-16 space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-2">{photo.title}</h2>
            <p className="text-white/70 text-sm leading-relaxed">{photo.description || "暂无描述。"}</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/50 border-b border-white/10 pb-2">详细信息</h3>
            
            <div className="grid grid-cols-1 gap-4 text-sm text-white/80">
              <div className="flex items-center gap-3">
                <Calendar size={16} className="text-blue-400" />
                <span>{new Date(photo.createdAt).toLocaleDateString()}</span>
              </div>
              
              <div className="flex items-center gap-3">
                <Camera size={16} className="text-blue-400" />
                <span>{photo.exif?.camera || '未知相机'}</span>
              </div>
              
              <div className="flex items-center gap-3">
                <Aperture size={16} className="text-blue-400" />
                <span>{photo.exif?.lens === '未知' ? '未知镜头' : (photo.exif?.lens || '未知镜头')}</span>
              </div>

              {photo.exif && (
                <div className="flex items-center gap-2 text-xs text-white/60 ml-7">
                    <span className="bg-white/10 px-2 py-1 rounded">{photo.exif.aperture}</span>
                    <span className="bg-white/10 px-2 py-1 rounded">{photo.exif.shutterSpeed}</span>
                    <span className="bg-white/10 px-2 py-1 rounded">{photo.exif.iso}</span>
                </div>
              )}

               <div className="flex items-center gap-3">
                <Maximize2 size={16} className="text-blue-400" />
                <span>{photo.width} x {photo.height} px</span>
              </div>

              {/* 作者信息 */}
              {photo.exif?.author && (
                <div className="flex items-center gap-3">
                  <User size={16} className="text-blue-400" />
                  <span>{photo.exif.author}</span>
                </div>
              )}

              {photo.exif?.copyright && (
                <div className="flex items-center gap-3">
                  <Copyright size={16} className="text-blue-400" />
                  <span className="text-xs">{photo.exif.copyright}</span>
                </div>
              )}

              {/* 地理位置信息 */}
              {(photo.exif?.country || photo.exif?.province || photo.exif?.city) && (
                <div className="flex items-center gap-3">
                  <MapPin size={16} className="text-blue-400" />
                  <span>
                    {[photo.exif.country, photo.exif.province, photo.exif.city]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div>
             <h3 className="text-xs font-bold uppercase tracking-widest text-white/50 border-b border-white/10 pb-2 mb-3">标签</h3>
             <div className="flex flex-wrap gap-2">
                {photo.tags.map(tag => (
                    <span key={tag} className="text-xs bg-blue-600/30 text-blue-200 px-2 py-1 rounded-md border border-blue-500/30">
                        #{tag}
                    </span>
                ))}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};