// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { AnalyticsTracker } from './AnalyticsTracker';
import { analytics } from '../api/analyticsService';
import { settingsService } from '../api/settingsService';

vi.mock('../api/settingsService', () => ({ settingsService: { getAnalyticsSettings: vi.fn() } }));

function Navigation() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate('/?photo=one')}>photo</button><button onClick={() => navigate('/albums')}>albums</button><button onClick={() => navigate('/admin')}>admin</button></>;
}

beforeEach(() => {
  analytics.reset();
  vi.mocked(settingsService.getAnalyticsSettings).mockResolvedValue({ enabled: true, measurementId: 'G-TEST123', umamiEnabled: false, umamiWebsiteId: '', umamiScriptUrl: 'https://cloud.umami.is/script.js' });
});
afterEach(() => { cleanup(); analytics.reset(); vi.restoreAllMocks(); });

describe('public analytics routing', () => {
  it('tracks normalized public pages once and ignores photo query changes', async () => {
    const pageView = vi.spyOn(analytics, 'pageView');
    render(<MemoryRouter initialEntries={['/']}><AnalyticsTracker /><Navigation /></MemoryRouter>);
    await waitFor(() => expect(pageView).toHaveBeenCalledWith('/', 'Fluent Gallery'));
    fireEvent.click(screen.getByRole('button', { name: 'photo' }));
    expect(pageView).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'albums' }));
    await waitFor(() => expect(pageView).toHaveBeenCalledWith('/albums', '画册 | Fluent Gallery'));
  });

  it('does not initialize or emit a page view when opened on admin', async () => {
    const pageView = vi.spyOn(analytics, 'pageView');
    render(<MemoryRouter initialEntries={['/admin']}><AnalyticsTracker /></MemoryRouter>);
    await Promise.resolve();
    expect(settingsService.getAnalyticsSettings).not.toHaveBeenCalled();
    expect(pageView).not.toHaveBeenCalled();
  });
});
