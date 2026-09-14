// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { analytics } from './analyticsService';

afterEach(() => analytics.reset());

const gaSettings = { enabled: true, measurementId: 'G-ABC123', umamiEnabled: false, umamiWebsiteId: '', umamiScriptUrl: 'https://cloud.umami.is/script.js' };
const umamiSettings = { enabled: false, measurementId: '', umamiEnabled: true, umamiWebsiteId: 'website-one', umamiScriptUrl: 'https://stats.example.com/script.js' };

describe('analytics service', () => {
  it('validates settings, configures manual page views, and does not duplicate configuration', () => {
    expect(analytics.isValidMeasurementId('G-ABC123')).toBe(true);
    expect(analytics.isValidMeasurementId('UA-123')).toBe(false);
    expect(analytics.initialize({ ...gaSettings, measurementId: ' g-abc123 ' })).toBe(true);
    analytics.initialize(gaSettings);
    analytics.pageView('/', 'Fluent Gallery');

    const calls = window.dataLayer || [];
    expect(calls.filter(call => call[0] === 'config')).toHaveLength(1);
    expect(calls).toContainEqual(['config', 'G-ABC123', { send_page_view: false }]);
    expect(calls).toContainEqual(['event', 'page_view', expect.objectContaining({ page_path: '/', page_location: expect.stringContaining('#/') })]);
    expect(document.getElementById('fluent-gallery-ga4')).toBeNull();
  });

  it('silently disables collection and discards events when configuration is off', () => {
    analytics.navigation('collection', 'hero_cta');
    expect(analytics.initialize({ ...gaSettings, enabled: false })).toBe(false);
    analytics.navigation('albums', 'header');
    expect(analytics.photoView('disabled-photo', 'gallery')).toBe(false);

    analytics.prepare();
    expect(analytics.initialize(gaSettings)).toBe(true);
    const events = (window.dataLayer || []).filter(call => call[0] === 'event');
    expect(events).toHaveLength(0);
    expect(analytics.photoView('disabled-photo', 'gallery')).toBe(true);
  });

  it('queues early events and deduplicates photo views for the page session', () => {
    analytics.selectContent('photo', 'photo-one', 'hero');
    expect(analytics.photoView('photo-one', 'hero')).toBe(true);
    expect(analytics.photoView('photo-one', 'gallery')).toBe(false);
    analytics.initialize(gaSettings);
    expect(analytics.photoView('photo-one', 'gallery')).toBe(false);
    analytics.share('photo-one', 'clipboard');

    const events = (window.dataLayer || []).filter(call => call[0] === 'event');
    expect(events.filter(call => call[1] === 'select_content')).toHaveLength(1);
    expect(events.filter(call => call[1] === 'photo_view')).toHaveLength(1);
    expect(events).toContainEqual(['event', 'share', { method: 'clipboard', content_type: 'photo', item_id: 'photo-one' }]);
  });

  it('loads Umami in manual mode and flushes queued page views and semantic events', () => {
    expect(analytics.initialize(umamiSettings)).toBe(true);
    analytics.pageView('/albums', '画册 | Fluent Gallery');
    analytics.share('photo-one', 'clipboard');

    const script = document.getElementById('fluent-gallery-umami') as HTMLScriptElement;
    expect(script.src).toBe('https://stats.example.com/script.js');
    expect(script.dataset.websiteId).toBe('website-one');
    expect(script.dataset.autoTrack).toBe('false');

    const track = vi.fn();
    window.umami = { track };
    script.onload?.(new Event('load'));
    expect(track).toHaveBeenCalledTimes(2);
    const pagePayload = track.mock.calls[0][0]({ hostname: 'gallery.example.com' });
    expect(pagePayload).toEqual({ hostname: 'gallery.example.com', url: '/albums', title: '画册 | Fluent Gallery' });
    expect(track).toHaveBeenCalledWith('share', { method: 'clipboard', content_type: 'photo', item_id: 'photo-one' });
  });

  it('dispatches to GA4 and Umami together without duplicating scripts', () => {
    const settings = { ...gaSettings, umamiEnabled: true, umamiWebsiteId: 'website-one', umamiScriptUrl: 'https://stats.example.com/script.js' };
    analytics.initialize(settings);
    const firstScript = document.getElementById('fluent-gallery-umami') as HTMLScriptElement;
    const track = vi.fn();
    window.umami = { track };
    firstScript.onload?.(new Event('load'));
    analytics.initialize(settings);
    analytics.navigation('albums', 'navbar');

    expect(document.querySelectorAll('#fluent-gallery-umami')).toHaveLength(1);
    expect(document.getElementById('fluent-gallery-umami')).toBe(firstScript);
    expect((window.dataLayer || []).filter(call => call[0] === 'event')).toContainEqual(['event', 'navigation_click', { navigation_target: 'albums', interaction_source: 'navbar' }]);
    expect(track).toHaveBeenCalledWith('navigation_click', { navigation_target: 'albums', interaction_source: 'navbar' });
  });

  it('removes provider scripts and stops sending when disabled', () => {
    analytics.initialize(umamiSettings);
    const script = document.getElementById('fluent-gallery-umami') as HTMLScriptElement;
    const track = vi.fn();
    window.umami = { track };
    script.onload?.(new Event('load'));
    analytics.disable();
    analytics.navigation('albums', 'navbar');

    expect(document.getElementById('fluent-gallery-umami')).toBeNull();
    expect(window.umami).toBeUndefined();
    expect(track).not.toHaveBeenCalled();
  });
});
