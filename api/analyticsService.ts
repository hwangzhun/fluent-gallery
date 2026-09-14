export interface AnalyticsSettings {
  enabled: boolean;
  measurementId: string;
}

export type InteractionSource = 'hero' | 'gallery' | 'album' | 'shared_link' | 'lightbox';
export type NavigationMethod = 'button' | 'keyboard' | 'swipe';

type AnalyticsParams = Record<string, string | number | boolean | undefined>;
type CollectionState = 'pending' | 'enabled' | 'disabled';

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/i;
const SCRIPT_ID = 'fluent-gallery-ga4';

class AnalyticsService {
  private enabled = false;
  private initialized = false;
  private collectionState: CollectionState = 'pending';
  private measurementId = '';
  private pending: Array<[string, AnalyticsParams]> = [];
  private viewedPhotos = new Set<string>();
  private pendingViewedPhotos = new Set<string>();

  isValidMeasurementId(value: string): boolean {
    return MEASUREMENT_ID_PATTERN.test(value.trim());
  }

  /** Allow public-page interactions to wait for the asynchronous settings request. */
  prepare(): void {
    this.collectionState = 'pending';
  }

  initialize(settings: AnalyticsSettings): boolean {
    const measurementId = settings.measurementId.trim().toUpperCase();
    if (!settings.enabled || !this.isValidMeasurementId(measurementId)) {
      this.disable();
      return false;
    }

    const previousId = this.measurementId;
    const needsConfiguration = !this.initialized || previousId !== measurementId;
    if (previousId && previousId !== measurementId) {
      (window as unknown as Record<string, unknown>)[`ga-disable-${previousId}`] = true;
    }
    this.enabled = true;
    this.collectionState = 'enabled';
    this.measurementId = measurementId;
    (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || ((...args: unknown[]) => { window.dataLayer?.push(args); });

    if (needsConfiguration) {
      window.gtag('js', new Date());
      window.gtag('config', measurementId, { send_page_view: false });
      this.initialized = true;
    }

    // Vitest receives the same event queue but never loads Google's remote script.
    const existingScript = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript?.dataset.measurementId !== measurementId) existingScript?.remove();
    if (import.meta.env.MODE !== 'test' && !document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.dataset.measurementId = measurementId;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      script.onerror = () => { /* Analytics must never interrupt the gallery. */ };
      document.head.appendChild(script);
    }

    this.pendingViewedPhotos.forEach(photoId => this.viewedPhotos.add(photoId));
    this.pendingViewedPhotos.clear();
    const pending = this.pending.splice(0);
    pending.forEach(([name, params]) => this.send(name, params));
    return true;
  }

  disable(): void {
    this.enabled = false;
    this.collectionState = 'disabled';
    if (this.measurementId) (window as unknown as Record<string, unknown>)[`ga-disable-${this.measurementId}`] = true;
    this.pending = [];
    this.pendingViewedPhotos.clear();
  }

  private send(name: string, params: AnalyticsParams = {}): boolean {
    const cleaned = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined));
    if (this.collectionState === 'disabled') return false;
    if (this.collectionState === 'pending' || !this.initialized) {
      this.pending.push([name, cleaned]);
      return true;
    }
    if (!this.enabled) return false;
    try {
      window.gtag?.('event', name, cleaned);
      return true;
    } catch {
      return false;
    }
  }

  pageView(path: '/' | '/albums', title: string): void {
    const pageLocation = `${window.location.origin}${window.location.pathname}#${path}`;
    this.send('page_view', { page_title: title, page_location: pageLocation, page_path: path });
  }

  selectContent(contentType: 'photo' | 'album', contentId: string, source: InteractionSource, extra: AnalyticsParams = {}): void {
    this.send('select_content', { content_type: contentType, content_id: contentId, interaction_source: source, ...extra });
  }

  photoView(photoId: string, source: InteractionSource, albumId?: string): boolean {
    if (this.viewedPhotos.has(photoId) || this.pendingViewedPhotos.has(photoId)) return false;
    if (this.collectionState === 'disabled') return false;
    if (this.collectionState === 'pending') {
      this.pendingViewedPhotos.add(photoId);
      return this.send('photo_view', { photo_id: photoId, interaction_source: source, album_id: albumId });
    }
    const sent = this.send('photo_view', { photo_id: photoId, interaction_source: source, album_id: albumId });
    if (sent) this.viewedPhotos.add(photoId);
    return sent;
  }

  photoLike(photoId: string, source: 'gallery' | 'lightbox'): void {
    this.send('photo_like', { photo_id: photoId, interaction_source: source });
  }

  share(photoId: string, method: 'web_share' | 'clipboard'): void {
    this.send('share', { method, content_type: 'photo', item_id: photoId });
  }

  galleryFilter(filterType: 'tag' | 'year' | 'all', filterValue: string): void {
    this.send('gallery_filter', { filter_type: filterType, filter_value: filterValue });
  }

  galleryLayout(layoutMode: 'expanded' | 'compact'): void {
    this.send('gallery_layout_change', { layout_mode: layoutMode });
  }

  loadMore(method: 'button' | 'automatic'): void {
    this.send('gallery_load_more', { navigation_method: method });
  }

  lightboxNavigate(photoId: string, direction: 'previous' | 'next', method: NavigationMethod): void {
    this.send('lightbox_navigate', { photo_id: photoId, navigation_target: direction, navigation_method: method });
  }

  photoDetails(photoId: string, expanded: boolean): void {
    this.send('photo_details_toggle', { photo_id: photoId, expanded });
  }

  lightboxClose(photoId: string, method: 'button' | 'keyboard' | 'backdrop'): void {
    this.send('lightbox_close', { photo_id: photoId, navigation_method: method });
  }

  navigation(target: string, source: string): void {
    this.send('navigation_click', { navigation_target: target, interaction_source: source });
  }

  outboundLink(domain: string, target: string): void {
    this.send('outbound_link', { link_domain: domain, navigation_target: target });
  }

  contentRetry(contentType: 'gallery' | 'albums' | 'load_more'): void {
    this.send('content_retry', { content_type: contentType });
  }

  /** Test-only state reset; harmless in production and keeps the singleton deterministic. */
  reset(): void {
    this.enabled = false;
    this.initialized = false;
    this.collectionState = 'pending';
    this.measurementId = '';
    this.pending = [];
    this.viewedPhotos.clear();
    this.pendingViewedPhotos.clear();
    delete window.gtag;
    delete window.dataLayer;
    document.getElementById(SCRIPT_ID)?.remove();
  }
}

export const analytics = new AnalyticsService();
