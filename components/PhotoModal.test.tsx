// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import exifr from 'exifr';
import type { Photo } from '../types';
import { PhotoModal, type PhotoUploadData } from './PhotoModal';
import { aiService } from '../services/aiService';

vi.mock('../services/albumService', () => ({ albumService: { list: vi.fn().mockResolvedValue([{ id: 'album-one', name: '旅行', published: false }]) } }));

vi.mock('exifr', () => ({ default: { parse: vi.fn() } }));
vi.mock('../services/tagService', () => ({
  tagService: { getAllTagNames: vi.fn().mockResolvedValue([]), createTag: vi.fn() },
}));
vi.mock('../services/aiService', () => ({
  aiService: { suggestMetadata: vi.fn(), suggestMetadataForPhoto: vi.fn() },
}));

function file(name: string, lastModified = 1) {
  return new File(['image'], name, { type: 'image/jpeg', lastModified });
}

function uploadedPhoto(data: PhotoUploadData): Photo {
  return {
    id: `photo-${data.file.name}`,
    url: `/${data.file.name}`,
    thumbnailUrl: `/${data.file.name}`,
    title: data.title,
    tags: [],
    year: data.year,
    width: 1200,
    height: 800,
    createdAt: '2026-01-01T00:00:00.000Z',
    likesCount: 0,
    viewsCount: 0,
  };
}

describe('PhotoModal batch upload', () => {
  let previewIndex = 0;

  beforeEach(() => {
    previewIndex = 0;
    vi.mocked(exifr.parse).mockResolvedValue(undefined);
    vi.mocked(aiService.suggestMetadata).mockResolvedValue({ title: '风里的光', tags: ['日常', '光影', '街头'] });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => `blob:preview-${previewIndex++}`),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.restoreAllMocks();
  });

  it('locks background scrolling while open and restores it when closed', () => {
    document.body.style.overflow = 'auto';
    const { rerender } = render(<PhotoModal isOpen mode="upload" onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<PhotoModal isOpen={false} mode="upload" onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('auto');
  });

  it('appends photos and only synchronizes a public field after it is edited', async () => {
    vi.mocked(exifr.parse).mockImplementation(async (selected) => ({
      Model: (selected as File).name,
    }));
    const { container } = render(<PhotoModal isOpen mode="upload" onClose={vi.fn()} />);

    const initialInput = screen.getByLabelText('选择要上传的照片');
    expect(initialInput).toHaveAttribute('multiple');
    fireEvent.change(initialInput, { target: { files: [file('first.jpg'), file('second.jpg')] } });

    await screen.findByText('选择缩略图编辑对应照片');
    expect(screen.getByLabelText('标题')).toHaveValue('first');
    fireEvent.click(screen.getByRole('tab', { name: '拍摄信息' }));
    expect(screen.getByLabelText('相机型号')).toHaveValue('first.jpg');
    expect(container.querySelectorAll('[role="switch"]')).toHaveLength(10);
    fireEvent.click(screen.getByRole('tab', { name: '基本信息' }));

    fireEvent.click(screen.getByLabelText('将标题设为公共字段'));
    fireEvent.click(screen.getByRole('button', { name: '编辑第 2 张：second' }));
    expect(screen.getByLabelText('标题')).toHaveValue('second');

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '公共标题' } });
    fireEvent.click(screen.getByRole('button', { name: '编辑第 1 张：公共标题' }));
    expect(screen.getByLabelText('标题')).toHaveValue('公共标题');

    fireEvent.change(screen.getByLabelText('继续添加照片'), { target: { files: [file('third.jpg')] } });
    await waitFor(() => expect(screen.getByLabelText('照片数量：3')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '编辑第 3 张：third' }));
    expect(screen.getByLabelText('标题')).toHaveValue('third');

    expect(screen.getByLabelText('将画册设为公共字段')).toBeInTheDocument();
    expect(screen.getByLabelText('将标题设为公共字段')).toHaveAttribute('aria-checked', 'true');
  });

  it('caps a batch at 50 photos instead of starting unbounded EXIF work', async () => {
    render(<PhotoModal isOpen mode="upload" onClose={vi.fn()} />);
    const files = Array.from({ length: 51 }, (_, index) => file(`photo-${index}.jpg`, index + 1));
    fireEvent.change(screen.getByLabelText('选择要上传的照片'), { target: { files } });
    await waitFor(() => expect(screen.getByLabelText('照片数量：50')).toBeInTheDocument());
    expect(screen.getByText(/1 个文件未加入/)).toBeInTheDocument();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(50);
  });

  it('generates a title and merges tags for every queued photo', async () => {
    vi.mocked(aiService.suggestMetadata)
      .mockResolvedValueOnce({ title: '第一束光', tags: ['日常', '光影', '街头'] })
      .mockResolvedValueOnce({ title: '风经过街角', tags: ['城市', '光影', '街头'] });
    render(<PhotoModal isOpen mode="upload" onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('选择要上传的照片'), { target: { files: [file('first.jpg'), file('second.jpg')] } });
    const tagInput = await screen.findByLabelText('标签');
    fireEvent.change(tagInput, { target: { value: '已有' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'AI 生成标题与标签' }));
    await waitFor(() => expect(screen.getByLabelText('标题')).toHaveValue('第一束光'));
    expect(screen.getByText('已有')).toBeInTheDocument();
    expect(screen.getByText('日常')).toBeInTheDocument();
    expect(screen.getByText('光影')).toBeInTheDocument();
    expect(screen.getByText('街头')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '编辑第 2 张：风经过街角' }));
    expect(screen.getByLabelText('标题')).toHaveValue('风经过街角');
    expect(aiService.suggestMetadata).toHaveBeenCalledTimes(2);
  });

  it('continues after a failure, shows results, and retries only failed photos', async () => {
    const attempts = new Map<string, number>();
    const onUpload = vi.fn(async (data: PhotoUploadData) => {
      const count = (attempts.get(data.file.name) || 0) + 1;
      attempts.set(data.file.name, count);
      if (data.file.name === 'failed.jpg' && count === 1) throw new Error('网络中断');
      return uploadedPhoto(data);
    });
    const onUploadBatchComplete = vi.fn();
    const onClose = vi.fn();
    render(
      <PhotoModal
        isOpen
        mode="upload"
        onClose={onClose}
        onUpload={onUpload}
        onUploadBatchComplete={onUploadBatchComplete}
      />,
    );

    fireEvent.change(screen.getByLabelText('选择要上传的照片'), {
      target: { files: [file('success.jpg'), file('failed.jpg')] },
    });
    await screen.findByRole('button', { name: '上传 2 张照片' });
    fireEvent.submit(document.getElementById('photo-form')!);

    expect(await screen.findByText('批量上传完成')).toBeTruthy();
    expect(screen.getByText('成功 1 张，失败 1 张')).toBeTruthy();
    expect(screen.getByText('网络中断')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(onUploadBatchComplete).toHaveBeenLastCalledWith(expect.objectContaining({
      attempted: 2,
      succeeded: 1,
      failed: 1,
      photos: [expect.objectContaining({ id: 'photo-success.jpg' })],
    }));

    fireEvent.click(screen.getByRole('button', { name: '重试失败项（1）' }));
    await waitFor(() => expect(screen.getByText('成功 2 张')).toBeTruthy());
    expect(onUpload).toHaveBeenCalledTimes(3);
    expect(onUploadBatchComplete).toHaveBeenLastCalledWith(expect.objectContaining({
      attempted: 1,
      succeeded: 1,
      failed: 0,
    }));

    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('ignores duplicates, accepts files within the batch cap, and releases removed previews', async () => {
    const files = Array.from({ length: 21 }, (_, index) => file(`photo-${index}.jpg`, index + 1));
    render(<PhotoModal isOpen mode="upload" onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('选择要上传的照片'), {
      target: { files: [...files, files[0]] },
    });

    expect(await screen.findByLabelText('照片数量：21')).toBeTruthy();
    expect(screen.getByText('已忽略 1 个重复文件')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '移除 photo-0' }));
    expect(screen.getByLabelText('照片数量：20')).toBeTruthy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-0');
  });

  it('validates every queued photo before starting the batch', async () => {
    const onUpload = vi.fn();
    render(<PhotoModal isOpen mode="upload" onClose={vi.fn()} onUpload={onUpload} />);
    fireEvent.change(screen.getByLabelText('选择要上传的照片'), { target: { files: [file('empty.jpg')] } });
    await screen.findByRole('button', { name: '上传 1 张照片' });
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '' } });
    fireEvent.submit(document.getElementById('photo-form')!);

    expect(await screen.findByText('请填写每张照片的标题和有效年份')).toBeTruthy();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('blocks Escape while uploading and keeps the result page open after success', async () => {
    let resolveUpload!: (photo: Photo) => void;
    const onUpload = vi.fn((data: PhotoUploadData) => new Promise<Photo>(resolve => {
      resolveUpload = resolve;
    }));
    const onClose = vi.fn();
    render(<PhotoModal isOpen mode="upload" onClose={onClose} onUpload={onUpload} />);
    fireEvent.change(screen.getByLabelText('选择要上传的照片'), { target: { files: [file('pending.jpg')] } });
    await screen.findByRole('button', { name: '上传 1 张照片' });
    fireEvent.submit(document.getElementById('photo-form')!);
    await screen.findByRole('button', { name: /上传中/ });

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => resolveUpload(uploadedPhoto({ file: file('pending.jpg'), title: 'pending', year: 2026, tags: '', exif: {} })));
    expect(await screen.findByText('成功 1 张')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('shares album choices, keeps per-photo overrides, and carries retry placement', async () => {
    let failed = false;
    const onUpload = vi.fn(async (data: PhotoUploadData) => {
      if (data.file.name === 'first.jpg' && !failed) { failed = true; throw new Error('重试'); }
      return uploadedPhoto(data);
    });
    render(<PhotoModal isOpen mode="upload" onClose={vi.fn()} onUpload={onUpload} />);
    fireEvent.change(screen.getByLabelText('选择要上传的照片'), { target: { files: [file('first.jpg'), file('second.jpg'), file('third.jpg')] } });
    fireEvent.click(await screen.findByLabelText('将画册设为公共字段'));
    fireEvent.click(await screen.findByRole('checkbox', { name: '旅行 · 草稿' }));
    fireEvent.click(screen.getByLabelText('将画册设为公共字段'));
    fireEvent.click(screen.getByRole('button', { name: '编辑第 3 张：third' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: '旅行 · 草稿' }));
    fireEvent.submit(document.getElementById('photo-form')!);
    await screen.findByText('成功 2 张，失败 1 张');
    expect(onUpload.mock.calls.map(([data]) => data.albumIds)).toEqual([['album-one'], ['album-one'], []]);
    fireEvent.click(screen.getByRole('button', { name: '重试失败项（1）' }));
    await screen.findByText('成功 3 张');
    expect(onUpload).toHaveBeenLastCalledWith(expect.objectContaining({ albumIds: ['album-one'], albumBeforePhotoIds: ['photo-second.jpg', 'photo-third.jpg'] }));
  });

});

describe('PhotoModal edit mode', () => {
  beforeEach(() => {
    vi.mocked(aiService.suggestMetadataForPhoto).mockResolvedValue({ title: '城市睡在雨里', tags: ['night', '雨夜', '街头'] });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('preserves the existing edit contract', async () => {
    const photo: Photo = {
      id: 'photo-1',
      url: '/full.jpg',
      thumbnailUrl: '/thumb.jpg',
      title: '夜景',
      tags: ['night', 'city'],
      year: 2024,
      width: 1200,
      height: 800,
      createdAt: '2024-01-01T00:00:00.000Z',
      likesCount: 0,
      viewsCount: 0,
      exif: { camera: 'Sony A7', lens: '35mm', aperture: 'f/2.0', shutterSpeed: '1/60s', iso: 'ISO 800', city: '香港' },
    };
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<PhotoModal isOpen mode="edit" photo={photo} onClose={onClose} onUpdate={onUpdate} />);

    await waitFor(() => expect(screen.getByLabelText('标题')).toHaveValue('夜景'));
    expect(screen.getByAltText('夜景')).toHaveAttribute('src', '/thumb.jpg');
    fireEvent.submit(document.getElementById('photo-form')!);

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('photo-1', expect.objectContaining({
      title: '夜景',
      year: 2024,
      tags: 'night, city',
      exif: expect.objectContaining({ camera: 'Sony A7', city: '香港' }),
    })));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('overwrites the title and merges tags without saving automatically', async () => {
    const photo: Photo = { id: 'photo-ai', url: '/full.jpg', thumbnailUrl: '/thumb.jpg', title: '旧标题', tags: ['night'], year: 2026, width: 1200, height: 800, createdAt: '', likesCount: 0, viewsCount: 0 };
    const onUpdate = vi.fn();
    render(<PhotoModal isOpen mode="edit" photo={photo} onClose={vi.fn()} onUpdate={onUpdate} />);
    fireEvent.click(await screen.findByRole('button', { name: 'AI 生成标题与标签' }));
    await waitFor(() => expect(screen.getByLabelText('标题')).toHaveValue('城市睡在雨里'));
    expect(screen.getByText('night')).toBeInTheDocument();
    expect(screen.getByText('雨夜')).toBeInTheDocument();
    expect(screen.getByText('街头')).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
