// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { settingsService } from '../../api/settingsService';
import { SettingsPanel } from './SettingsPanel';

const { first, second } = vi.hoisted(() => {
  const first = { id: 'first', title: '第一张', url: '/first.jpg', thumbnailUrl: '/first-small.jpg', width: 1600, height: 900, year: 2026, tags: [], createdAt: '2026-01-01', likesCount: 0, viewsCount: 0 };
  return { first, second: { ...first, id: 'second', title: '第二张', url: '/second.jpg', thumbnailUrl: '/second-small.jpg' } };
});

vi.mock('../../api/settingsService', () => ({
  settingsService: {
    getAuthorSettings: vi.fn().mockResolvedValue({ author: '', copyright: '' }),
    updateAuthorSettings: vi.fn().mockResolvedValue(undefined),
    getStorageSettings: vi.fn().mockResolvedValue({ mode: 'local', local: { uploadDir: './uploads', publicUrl: '/uploads' }, oss: {} }),
    getGallerySettings: vi.fn().mockResolvedValue({ randomizePhotos: false, heroPhotoId: 'first', heroImageFit: 'cover', heroAspectRatio: '4:3', heroImagePositionX: 20, heroImagePositionY: 80, heroImageScale: 1.5, heroImagePositionPhotoId: 'first' }),
    getSeoSettings: vi.fn().mockResolvedValue({ title: 'Fluent Gallery | 摄影作品集', description: 'Fluent Gallery 是一个记录光影、城市、自然与日常片刻的摄影画廊。', keywords: 'Fluent Gallery, 摄影, 摄影作品集, 在线画廊, 光影, 城市摄影', author: 'Fluent Gallery', canonicalUrl: '', ogTitle: '', ogDescription: '', ogImage: '' }),
    getAiSettings: vi.fn().mockResolvedValue({ baseUrl: '', model: '', apiKey: '', hasApiKey: false }),
    getAnalyticsSettings: vi.fn().mockResolvedValue({ enabled: false, measurementId: '', umamiEnabled: false, umamiWebsiteId: '', umamiScriptUrl: 'https://cloud.umami.is/script.js' }),
    updateGallerySettings: vi.fn(), updateStorageSettings: vi.fn(), updateSeoSettings: vi.fn(), updateAiSettings: vi.fn(), updateAnalyticsSettings: vi.fn(), updatePassword: vi.fn(),
  },
}));
vi.mock('../../api/photoService', () => ({ photoService: { getPhotos: vi.fn().mockResolvedValue([first, second]) } }));

afterEach(() => { cleanup(); localStorage.clear(); });

describe('SettingsPanel Hero settings', () => {
  it('resets the crop to the center when the selected Hero changes', async () => {
    render(<SettingsPanel onSessionExpired={vi.fn()} />);
    const initialFrame = await screen.findByRole('group', { name: '调整 Hero 图片《第一张》的显示区域' });
    expect(initialFrame.style.getPropertyValue('--hero-position-x')).toBe('20%');
    expect(initialFrame.style.getPropertyValue('--hero-position-y')).toBe('80%');
    expect(initialFrame.style.getPropertyValue('--hero-image-scale')).toBe('1.5');
    fireEvent.click(screen.getByRole('button', { name: /浏览图片/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /第一张/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /第二张/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认选择' }));
    fireEvent.click(screen.getByRole('radio', { name: /铺满画框/ }));
    const nextFrame = screen.getByRole('group', { name: '调整 Hero 图片《第二张》的显示区域' });
    expect(nextFrame.style.getPropertyValue('--hero-position-x')).toBe('50%');
    expect(nextFrame.style.getPropertyValue('--hero-position-y')).toBe('50%');
    expect(nextFrame.style.getPropertyValue('--hero-image-scale')).toBe('1');
  });
});


it('keeps each photo crop when switching thumbnails and retains edits after a failed save', async () => {
  vi.mocked(settingsService.updateGallerySettings).mockRejectedValueOnce(new Error('保存失败，请重试'));
  render(<SettingsPanel onSessionExpired={vi.fn()} />);
  await screen.findByRole('group', { name: '调整 Hero 图片《第一张》的显示区域' });
  fireEvent.click(screen.getByRole('button', { name: /浏览图片/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /第二张/ }));
  fireEvent.click(screen.getByRole('button', { name: '确认选择' }));
  fireEvent.click(screen.getByRole('button', { name: '第二张' }));
  fireEvent.click(screen.getByRole('radio', { name: /铺满画框/ }));
  fireEvent.click(screen.getByRole('radio', { name: '方形 1:1' }));
  fireEvent.keyDown(screen.getByRole('group', { name: '调整 Hero 图片《第二张》的显示区域' }), { key: '+' });
  fireEvent.click(screen.getByRole('button', { name: '第一张' }));
  expect(screen.getByRole('group', { name: '调整 Hero 图片《第一张》的显示区域' }).style.getPropertyValue('--hero-image-scale')).toBe('1.5');
  fireEvent.click(screen.getByRole('button', { name: '保存展示设置' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('保存失败，请重试');
  expect(settingsService.updateGallerySettings).toHaveBeenLastCalledWith(expect.objectContaining({ heroImages: [
    { photoId: 'first', fit: 'cover', aspectRatio: '4:3', positionX: 20, positionY: 80, scale: 1.5 },
    { photoId: 'second', fit: 'cover', aspectRatio: '1:1', positionX: 50, positionY: 50, scale: 1.1 },
  ] }));
  fireEvent.click(screen.getByRole('button', { name: '第二张' }));
  expect(screen.getByRole('radio', { name: '方形 1:1' })).toBeChecked();
  expect(screen.getByRole('group', { name: '调整 Hero 图片《第二张》的显示区域' }).style.getPropertyValue('--hero-image-scale')).toBe('1.1');
});

it('saves author defaults independently of SEO settings', async () => {
  render(<SettingsPanel onSessionExpired={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: '作者信息' }));
  fireEvent.change(screen.getByLabelText('作者'), { target: { value: '新作者' } });
  fireEvent.change(screen.getByLabelText('版权'), { target: { value: '© 我的作品' } });
  fireEvent.click(screen.getByRole('button', { name: '保存作者信息' }));
  await waitFor(() => expect(settingsService.updateAuthorSettings).toHaveBeenCalledWith({ author: '新作者', copyright: '© 我的作品' }));
});


it('offers retry instead of saving blank defaults when author settings fail to load', async () => {
  vi.mocked(settingsService.getAuthorSettings).mockRejectedValueOnce(new Error('offline'));
  render(<SettingsPanel onSessionExpired={vi.fn()} />);
  expect(await screen.findByText('设置暂时无法加载')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '保存展示设置' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
  expect(await screen.findByRole('button', { name: '保存展示设置' })).toBeInTheDocument();
});

it('loads and saves independent GA4 and Umami analytics settings', async () => {
  render(<SettingsPanel onSessionExpired={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: '数据统计' }));
  fireEvent.click(screen.getByRole('switch', { name: '启用 GA4 统计' }));
  fireEvent.change(screen.getByLabelText('Measurement ID'), { target: { value: 'G-TEST123' } });
  fireEvent.click(screen.getByRole('switch', { name: '启用 Umami 统计' }));
  fireEvent.change(screen.getByLabelText('Umami Website ID'), { target: { value: 'website-one' } });
  fireEvent.change(screen.getByLabelText('Umami Script URL'), { target: { value: 'https://stats.example.com/script.js' } });
  fireEvent.click(screen.getByRole('button', { name: '保存数据统计设置' }));
  await waitFor(() => expect(settingsService.updateAnalyticsSettings).toHaveBeenCalledWith({ enabled: true, measurementId: 'G-TEST123', umamiEnabled: true, umamiWebsiteId: 'website-one', umamiScriptUrl: 'https://stats.example.com/script.js' }));
});

it('masks configured storage and API keys without submitting the mask', async () => {
  vi.mocked(settingsService.getStorageSettings).mockResolvedValueOnce({
    mode: 'oss',
    local: { uploadDir: './uploads', publicUrl: '/uploads' },
    oss: { provider: 'aliyun', uploadDir: 'gallery', cloudImageProcessing: false, publicUrl: '', region: 'oss-cn-hangzhou', bucket: 'gallery', accessKeyId: '', accessKeySecret: '', hasAccessKeyId: true, hasAccessKeySecret: true },
  });
  vi.mocked(settingsService.getAiSettings).mockResolvedValueOnce({ baseUrl: 'https://api.example.com', model: 'vision', apiKey: '', hasApiKey: true });
  vi.mocked(settingsService.updateStorageSettings).mockResolvedValueOnce(undefined);
  vi.mocked(settingsService.updateAiSettings).mockResolvedValueOnce(undefined);
  render(<SettingsPanel onSessionExpired={vi.fn()} />);

  fireEvent.click(await screen.findByRole('button', { name: '存储' }));
  const accessKeyId = screen.getByLabelText('Access Key ID');
  const accessKeySecret = screen.getByLabelText('Access Key Secret');
  expect(accessKeyId).toHaveValue('********');
  expect(accessKeySecret).toHaveValue('********');
  fireEvent.focus(accessKeyId);
  expect(accessKeyId).toHaveValue('');
  fireEvent.blur(accessKeyId);
  expect(accessKeyId).toHaveValue('********');
  fireEvent.focus(accessKeySecret);
  fireEvent.change(accessKeySecret, { target: { value: 'replacement-secret' } });
  fireEvent.click(screen.getByRole('button', { name: '保存存储设置' }));
  await waitFor(() => expect(settingsService.updateStorageSettings).toHaveBeenCalledWith(expect.objectContaining({
    oss: expect.objectContaining({ accessKeyId: '', accessKeySecret: 'replacement-secret' }),
  })));
  expect(JSON.stringify(vi.mocked(settingsService.updateStorageSettings).mock.calls.at(-1)?.[0])).not.toContain('********');
  await waitFor(() => expect(accessKeySecret).toHaveValue('********'));

  fireEvent.click(screen.getByRole('button', { name: 'API 设置' }));
  const apiKey = screen.getByLabelText('API Key');
  expect(apiKey).toHaveValue('********');
  fireEvent.focus(apiKey);
  fireEvent.change(apiKey, { target: { value: 'replacement-api-key' } });
  fireEvent.click(screen.getByRole('button', { name: '保存 API 设置' }));
  await waitFor(() => expect(settingsService.updateAiSettings).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'replacement-api-key' })));
  expect(JSON.stringify(vi.mocked(settingsService.updateAiSettings).mock.calls.at(-1)?.[0])).not.toContain('********');
  await waitFor(() => expect(apiKey).toHaveValue('********'));
});

it('shows person-free Fluent Gallery SEO defaults', async () => {
  render(<SettingsPanel onSessionExpired={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'SEO' }));

  expect(screen.getByLabelText('页面标题')).toHaveValue('Fluent Gallery | 摄影作品集');
  expect(screen.getByLabelText('作者')).toHaveValue('Fluent Gallery');
  expect(document.body).not.toHaveTextContent('Hwangzhun');
});
