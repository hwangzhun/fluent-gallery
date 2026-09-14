export interface AnalyticsSettings {
  enabled: boolean;
  measurementId: string;
  umamiEnabled: boolean;
  umamiWebsiteId: string;
  umamiScriptUrl: string;
}

export type InteractionSource = 'hero' | 'gallery' | 'album' | 'shared_link' | 'lightbox';
export type NavigationMethod = 'button' | 'keyboard' | 'swipe';

type AnalyticsParams = Record<string, string | number | boolean | undefined>;
type CollectionState = 'pending' | 'enabled' | 'disabled';
type UmamiPayload = Record<string, unknown>;
type UmamiTrack = {
  (eventName: string, data?: AnalyticsParams): unknown;
  (payload: UmamiPayload | ((properties: UmamiPayload) => UmamiPayload)): unknown;
};

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
    umami?: { track: UmamiTrack };
  }
}

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/i;
const GA_SCRIPT_ID = 'fluent-gallery-ga4';
const UMAMI_SCRIPT_ID = 'fluent-gallery-umami';

class AnalyticsService {
  private gaEnabled = false;
  private gaInitialized = false;
  private umamiEnabled = false;
  private umamiReady = false;
  private collectionState: CollectionState = 'pending';
  private measurementId = '';
  private umamiConfigKey = '';
  private pending: Array<[string, AnalyticsParams]> = [];
  private umamiPending: Array<[string, AnalyticsParams]> = [];
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
    const gaEnabled = settings.enabled && this.isValidMeasurementId(measurementId);
    const umamiWebsiteId = settings.umamiWebsiteId.trim();
    const umamiScriptUrl = settings.umamiScriptUrl.trim();
    const umamiEnabled = settings.umamiEnabled && Boolean(umamiWebsiteId) && this.isValidHttpUrl(umamiScriptUrl);
    if (!gaEnabled && !umamiEnabled) {
      this.disable();
      return false;
    }

    this.collectionState = 'enabled';
    this.configureGa(gaEnabled, measurementId);
    this.configureUmami(umamiEnabled, umamiWebsiteId, umamiScriptUrl);

    this.pendingViewedPhotos.forEach(photoId => this.viewedPhotos.add(photoId));
    this.pendingViewedPhotos.clear();
    const pending = this.pending.splice(0);
    pending.forEach(([name, params]) => this.send(name, params));
    return true;
  }

  disable(): void {
    this.collectionState = 'disabled';
    if (this.measurementId) (window as unknown as Record<string, unknown>)[`ga-disable-${this.measurementId}`] = true;
    this.gaEnabled = false;
    this.gaInitialized = false;
    this.umamiEnabled = false;
    this.umamiReady = false;
    this.measurementId = '';
    this.umamiConfigKey = '';
    this.pending = [];
    this.umamiPending = [];
    this.pendingViewedPhotos.clear();
    document.getElementById(GA_SCRIPT_ID)?.remove();
    document.getElementById(UMAMI_SCRIPT_ID)?.remove();
    delete window.umami;
  }

  private send(name: string, params: AnalyticsParams = {}): boolean {
    const cleaned = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined));
    if (this.collectionState === 'disabled') return false;
    if (this.collectionState === 'pending') {
      this.pending.push([name, cleaned]);
      return true;
    }
    let accepted = false;
    if (this.gaEnabled && this.gaInitialized) {
      try {
        window.gtag?.('event', name, cleaned);
        accepted = true;
      } catch { /* One analytics provider must not interrupt another. */ }
    }
    if (this.umamiEnabled) {
      if (!this.umamiReady || !window.umami?.track) {
        this.umamiPending.push([name, cleaned]);
        accepted = true;
      } else {
        accepted = this.sendToUmami(name, cleaned) || accepted;
      }
    }
    return accepted;
  }

  private configureGa(enabled: boolean, measurementId: string): void {
    if (!enabled) {
      if (this.measurementId) (window as unknown as Record<string, unknown>)[`ga-disable-${this.measurementId}`] = true;
      this.gaEnabled = false;
      this.gaInitialized = false;
      this.measurementId = '';
      document.getElementById(GA_SCRIPT_ID)?.remove();
      return;
    }
    const previousId = this.measurementId;
    const needsConfiguration = !this.gaInitialized || previousId !== measurementId;
    if (previousId && previousId !== measurementId) (window as unknown as Record<string, unknown>)[`ga-disable-${previousId}`] = true;
    this.gaEnabled = true;
    this.measurementId = measurementId;
    (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || ((...args: unknown[]) => { window.dataLayer?.push(args); });
    if (needsConfiguration) {
      window.gtag('js', new Date());
      window.gtag('config', measurementId, { send_page_view: false });
      this.gaInitialized = true;
    }
    const existingScript = document.getElementById(GA_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript?.dataset.measurementId !== measurementId) existingScript?.remove();
    if (import.meta.env.MODE !== 'test' && !document.getElementById(GA_SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = GA_SCRIPT_ID;
      script.dataset.measurementId = measurementId;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      script.onerror = () => { /* Analytics must never interrupt the gallery. */ };
      document.head.appendChild(script);
    }
  }

  private configureUmami(enabled: boolean, websiteId: string, scriptUrl: string): void {
    if (!enabled) {
      this.umamiEnabled = false;
      this.umamiReady = false;
      this.umamiConfigKey = '';
      this.umamiPending = [];
      document.getElementById(UMAMI_SCRIPT_ID)?.remove();
      delete window.umami;
      return;
    }
    const configKey = `${websiteId}\n${scriptUrl}`;
    const existingScript = document.getElementById(UMAMI_SCRIPT_ID) as HTMLScriptElement | null;
    if (this.umamiConfigKey !== configKey || existingScript?.dataset.websiteId !== websiteId || existingScript?.src !== scriptUrl) {
      existingScript?.remove();
      delete window.umami;
      this.umamiReady = false;
      this.umamiPending = [];
    }
    this.umamiEnabled = true;
    this.umamiConfigKey = configKey;
    if (document.getElementById(UMAMI_SCRIPT_ID)) return;
    const script = document.createElement('script');
    script.id = UMAMI_SCRIPT_ID;
    script.defer = true;
    script.src = scriptUrl;
    script.dataset.websiteId = websiteId;
    script.dataset.autoTrack = 'false';
    script.onload = () => {
      if (!this.umamiEnabled || this.umamiConfigKey !== configKey || !window.umami?.track) return;
      this.umamiReady = true;
      const pending = this.umamiPending.splice(0);
      pending.forEach(([name, params]) => this.sendToUmami(name, params));
    };
    script.onerror = () => {
      if (this.umamiConfigKey !== configKey) return;
      this.umamiReady = false;
      this.umamiEnabled = false;
      this.umamiPending = [];
    };
    document.head.appendChild(script);
  }

  private sendToUmami(name: string, params: AnalyticsParams): boolean {
    try {
      if (!window.umami?.track) return false;
      if (name === 'page_view') {
        const path = typeof params.page_path === 'string' ? params.page_path : window.location.pathname;
        const title = typeof params.page_title === 'string' ? params.page_title : document.title;
        window.umami.track(properties => ({ ...properties, url: path, title }));
      } else {
        window.umami.track(name, params);
      }
      return true;
    } catch {
      return false;
    }
  }

  private isValidHttpUrl(value: string): boolean {
    try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
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
    this.disable();
    this.collectionState = 'pending';
    this.viewedPhotos.clear();
    delete window.gtag;
    delete window.dataLayer;
  }
}

export const analytics = new AnalyticsService();
