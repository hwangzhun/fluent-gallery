// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { BatchResults } from './BatchUploadFields';
import type { PhotoUploadItem } from './types';

describe('batch upload result semantics', () => {
  it('does not label a queued background job as completed', () => {
    const item: PhotoUploadItem = {
      id: 'upload-1',
      file: new File(['image'], 'queued.jpg', { type: 'image/jpeg' }),
      fileKey: 'queued',
      previewUrl: 'blob:queued',
      data: { title: '待处理照片', year: 2026, tags: '', exif: {} },
      exifStatus: 'ready',
      uploadStatus: 'processing',
      queuedUpload: { kind: 'queued', jobId: 'job-1', photoId: 'photo-job-1' },
    };

    render(<BatchResults items={[item]} successCount={0} processingCount={1} failedCount={0} />);
    expect(screen.getByText('已提交后台处理')).toBeInTheDocument();
    expect(screen.getByText('后台处理中')).toBeInTheDocument();
    expect(screen.queryByText('批量上传完成')).not.toBeInTheDocument();
  });
});
