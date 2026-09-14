import React, { useCallback, useMemo, useState } from 'react';
import { Images } from 'lucide-react';
import type { GallerySettings } from '../../api/settingsService';
import type { Photo } from '../../types';
import { defaultHeroImage, getHeroImages, HERO_ASPECT_RATIOS, legacyHeroImage, type HeroImageSettings } from '../../shared/hero';
import { HeroPhotoPicker } from './HeroPhotoPicker';
import { HeroCropPreview } from './HeroCropPreview';

interface Props { gallery: GallerySettings; photos: Photo[]; onChange: (settings: GallerySettings) => void; }
export function HeroSettingsEditor({ gallery, photos, onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const images = useMemo(() => getHeroImages(gallery), [gallery]);
  const selectedIds = useMemo(() => images.map(image => image.photoId), [images]);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const active = images.find(image => image.photoId === activeId) ?? images[0];
  const photo = active ? photos.find(photo => photo.id === active.photoId) ?? null : photos.find(photo => photo.width >= photo.height) ?? photos[0] ?? null;
  const view = active ?? legacyHeroImage(gallery, photo?.id || '');

  const updateView = (patch: Partial<HeroImageSettings>) => {
    if (active) onChange({ ...gallery, heroImages: images.map(image => image.photoId === active.photoId ? { ...image, ...patch } : image) });
    else {
      const next = { ...view, ...patch };
      onChange({ ...gallery, heroImages: [], heroImageFit: next.fit, heroAspectRatio: next.aspectRatio,
        heroImagePositionX: next.positionX, heroImagePositionY: next.positionY, heroImageScale: next.scale, heroImagePositionPhotoId: photo?.id || null });
    }
  };
  const selectPhotos = (ids: string[]) => {
    onChange({ ...gallery, heroPhotoId: ids[0] ?? null, heroImages: ids.map(id => images.find(image => image.photoId === id) ?? defaultHeroImage(id)) });
    setActiveId(current => ids.includes(current || '') ? current : ids[0] ?? null);
  };
  return <div className="mt-7 rounded-xl border border-slate-200 p-4 sm:p-5">
    <p className="font-medium text-slate-900">Hero 封面图片</p>
    <p className="mt-1 text-sm text-slate-500">选择多张作品，每次进入首页随机展示一张；点击缩略图单独调整构图。</p>
    <button type="button" className="hero-current-selection" onClick={() => setPickerOpen(true)}>
      <span className="hero-current-thumb">{photo ? <img src={photo.thumbnailUrl} alt="" /> : <Images size={23} />}</span>
      <span><strong>{images.length ? `已选择 ${images.length} 幅作品` : '自动选择'}</strong><small>{images.length ? '浏览图片以添加或移除作品' : '优先使用最新横幅作品'}</small></span><em>浏览图片</em>
    </button>
    {images.length > 0 && <div className="hero-selected-photos" role="group" aria-label="编辑已选 Hero 图片">{images.map(image => {
      const item = photos.find(photo => photo.id === image.photoId);
      return <button type="button" key={image.photoId} aria-pressed={active?.photoId === image.photoId} onClick={() => setActiveId(image.photoId)}>
        {item && <img src={item.thumbnailUrl} alt="" />}<span>{item?.title || '照片不可用，请移除'}</span>
      </button>;
    })}</div>}
    <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(240px,.8fr)]">
      <div>
        <fieldset><legend className="text-sm font-medium text-slate-700">展示方式</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{([
          { value: 'contain', label: '完整显示', description: '保留整幅照片，画框可能留白。' },
          { value: 'cover', label: '铺满画框', description: '充满画框，可调整位置和缩放。' },
        ] as const).map(option => <label key={option.value} className={`cursor-pointer border p-3 ${view.fit === option.value ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>
          <input className="sr-only" type="radio" name="heroImageFit" checked={view.fit === option.value} onChange={() => updateView({ fit: option.value })} />
          <span className="block font-medium text-slate-900">{option.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{option.description}</span>
        </label>)}</div></fieldset>
        <fieldset className="mt-5"><legend className="text-sm font-medium text-slate-700">画幅尺寸</legend><div className="mt-2 grid grid-cols-2 gap-2">{HERO_ASPECT_RATIOS.map(option => <label key={option.value} className={`cursor-pointer border p-3 text-sm ${view.aspectRatio === option.value ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>
          <input className="sr-only" type="radio" name="heroAspectRatio" checked={view.aspectRatio === option.value} onChange={() => updateView({ aspectRatio: option.value })} />
          <span>{option.label}</span>{option.value === 'xpan' && <small className="mt-1 block text-slate-500">24 × 65 mm · 65:24</small>}
        </label>)}</div></fieldset>
      </div>
      <div className="min-w-0"><p className="mb-2 text-xs font-medium text-slate-500">Hero 预览 · {active ? photo?.title : '自动选择'}</p>
        <HeroCropPreview photo={photo} fit={view.fit} aspectRatio={view.aspectRatio} positionX={view.positionX} positionY={view.positionY} scale={view.scale}
          onViewChange={(positionX, positionY, scale) => updateView({ positionX, positionY, scale })} onReset={() => updateView({ positionX: 50, positionY: 50, scale: 1 })} />
      </div>
    </div>
    <HeroPhotoPicker open={pickerOpen} photos={photos} selectedIds={selectedIds} onClose={closePicker} onConfirm={selectPhotos} />
  </div>;
}
