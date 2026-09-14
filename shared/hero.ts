export const HERO_ASPECT_RATIOS = [
  { value: '4:3', label: '横版 4:3', ratio: '4 / 3' },
  { value: '1:1', label: '方形 1:1', ratio: '1 / 1' },
  { value: '3:2', label: '横版 3:2', ratio: '3 / 2' },
  { value: '16:9', label: '宽幅 16:9', ratio: '16 / 9' },
  { value: '2:1', label: '宽幅 2:1', ratio: '2 / 1' },
  { value: '2.35:1', label: '宽幅 2.35:1', ratio: '2.35 / 1' },
  { value: 'xpan', label: 'X‑Pan 超宽幅', ratio: '65 / 24' },
] as const;
export type HeroAspectRatio = typeof HERO_ASPECT_RATIOS[number]['value'];
export interface HeroImageSettings {
  photoId: string;
  fit: 'contain' | 'cover';
  aspectRatio: HeroAspectRatio;
  positionX: number;
  positionY: number;
  scale: number;
}
export const isHeroAspectRatio = (value: unknown): value is HeroAspectRatio => HERO_ASPECT_RATIOS.some(item => item.value === value);
const inRange = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
export function isHeroImageSettings(value: unknown): value is HeroImageSettings {
  if (!value || typeof value !== 'object') return false;
  const item = value as HeroImageSettings;
  return typeof item.photoId === 'string' && Boolean(item.photoId.trim()) && item.photoId === item.photoId.trim()
    && ['contain', 'cover'].includes(item.fit) && isHeroAspectRatio(item.aspectRatio)
    && inRange(item.positionX, 0, 100) && inRange(item.positionY, 0, 100) && inRange(item.scale, 1, 3);
}
export const defaultHeroImage = (photoId: string): HeroImageSettings => ({ photoId, fit: 'contain', aspectRatio: '4:3', positionX: 50, positionY: 50, scale: 1 });

export interface LegacyHeroSettings {
  heroPhotoId: string | null;
  heroImageFit: 'contain' | 'cover';
  heroAspectRatio: HeroAspectRatio;
  heroImagePositionX: number;
  heroImagePositionY: number;
  heroImageScale: number;
  heroImagePositionPhotoId: string | null;
}
export function legacyHeroImage(settings: LegacyHeroSettings, photoId: string): HeroImageSettings {
  const matches = photoId === settings.heroImagePositionPhotoId;
  return { photoId, fit: settings.heroImageFit, aspectRatio: settings.heroAspectRatio,
    positionX: matches ? settings.heroImagePositionX : 50, positionY: matches ? settings.heroImagePositionY : 50, scale: matches ? settings.heroImageScale : 1 };
}
export function getHeroImages(settings: LegacyHeroSettings & { heroImages?: HeroImageSettings[] }): HeroImageSettings[] {
  return settings.heroImages ?? (settings.heroPhotoId ? [legacyHeroImage(settings, settings.heroPhotoId)] : []);
}
