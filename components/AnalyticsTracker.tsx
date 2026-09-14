import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { analytics } from '../api/analyticsService';
import { settingsService } from '../api/settingsService';

const PUBLIC_PAGES = {
  '/': 'Fluent Gallery',
  '/albums': '画册 | Fluent Gallery',
} as const;

export function AnalyticsTracker() {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const requestVersion = useRef(0);
  const lastPage = useRef<string | null>(null);
  const isPublic = location.pathname === '/' || location.pathname === '/albums';

  useEffect(() => {
    const version = ++requestVersion.current;
    if (!isPublic) {
      analytics.disable();
      setReady(false);
      lastPage.current = null;
      return;
    }
    analytics.prepare();
    settingsService.getAnalyticsSettings()
      .then(settings => { if (version === requestVersion.current) setReady(analytics.initialize(settings)); })
      .catch(() => { if (version === requestVersion.current) { analytics.disable(); setReady(false); } });
    return () => { requestVersion.current += 1; };
  }, [isPublic]);

  useEffect(() => {
    if (!ready || !isPublic || lastPage.current === location.pathname) return;
    const path = location.pathname as keyof typeof PUBLIC_PAGES;
    analytics.pageView(path, PUBLIC_PAGES[path]);
    lastPage.current = path;
  }, [isPublic, location.pathname, ready]);

  useEffect(() => {
    if (!ready || !isPublic) return;
    const onClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!anchor) return;
      try {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) analytics.outboundLink(url.hostname, url.pathname || '/');
      } catch { /* Ignore malformed or browser-managed links. */ }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [isPublic, ready]);

  return null;
}
