// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { analytics } from './analyticsService';

afterEach(() => analytics.reset());

describe('analytics service', () => {
  it('validates settings, configures manual page views, and does not duplicate configuration', () => {
    expect(analytics.isValidMeasurementId('G-ABC123')).toBe(true);
    expect(analytics.isValidMeasurementId('UA-123')).toBe(false);
    expect(analytics.initialize({ enabled: true, measurementId: ' g-abc123 ' })).toBe(true);
    analytics.initialize({ enabled: true, measurementId: 'G-ABC123' });
    analytics.pageView('/', 'Fluent Gallery');

    const calls = window.dataLayer || [];
    expect(calls.filter(call => call[0] === 'config')).toHaveLength(1);
    expect(calls).toContainEqual(['config', 'G-ABC123', { send_page_view: false }]);
    expect(calls).toContainEqual(['event', 'page_view', expect.objectContaining({ page_path: '/', page_location: expect.stringContaining('#/') })]);
    expect(document.getElementById('fluent-gallery-ga4')).toBeNull();
  });

  it('silently disables collection and discards events when configuration is off', () => {
    analytics.navigation('collection', 'hero_cta');
    expect(analytics.initialize({ enabled: false, measurementId: 'G-ABC123' })).toBe(false);
    analytics.navigation('albums', 'header');
    expect(analytics.photoView('disabled-photo', 'gallery')).toBe(false);

    analytics.prepare();
    expect(analytics.initialize({ enabled: true, measurementId: 'G-ABC123' })).toBe(true);
    const events = (window.dataLayer || []).filter(call => call[0] === 'event');
    expect(events).toHaveLength(0);
    expect(analytics.photoView('disabled-photo', 'gallery')).toBe(true);
  });

  it('queues early events and deduplicates photo views for the page session', () => {
    analytics.selectContent('photo', 'photo-one', 'hero');
    expect(analytics.photoView('photo-one', 'hero')).toBe(true);
    expect(analytics.photoView('photo-one', 'gallery')).toBe(false);
    analytics.initialize({ enabled: true, measurementId: 'G-ABC123' });
    expect(analytics.photoView('photo-one', 'gallery')).toBe(false);
    analytics.share('photo-one', 'clipboard');

    const events = (window.dataLayer || []).filter(call => call[0] === 'event');
    expect(events.filter(call => call[1] === 'select_content')).toHaveLength(1);
    expect(events.filter(call => call[1] === 'photo_view')).toHaveLength(1);
    expect(events).toContainEqual(['event', 'share', { method: 'clipboard', content_type: 'photo', item_id: 'photo-one' }]);
  });
});
