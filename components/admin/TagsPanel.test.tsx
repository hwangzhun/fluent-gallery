// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tagService } from '../../services/tagService';
import { TagsPanel } from './TagsPanel';

const mockTags = vi.hoisted(() => [
  { id: 1, name: '城市', created_at: '2026-01-02T00:00:00.000Z', photoCount: 12 },
  { id: 2, name: '夜景', created_at: '2026-01-03T00:00:00.000Z', photoCount: 3 },
]);

vi.mock('../../services/tagService', () => ({
  tagService: {
    getAdminTags: vi.fn().mockResolvedValue(mockTags),
    createTag: vi.fn().mockResolvedValue({ id: 3, name: '人像', created_at: '2026-01-04' }),
    renameTag: vi.fn().mockResolvedValue({ id: 1, name: '街道', created_at: '2026-01-02' }),
    deleteTag: vi.fn().mockResolvedValue(undefined),
  },
}));

beforeEach(() => { vi.mocked(tagService.getAdminTags).mockResolvedValue(mockTags); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('TagsPanel', () => {
  it('shows counts, searches, creates, and renames inline', async () => {
    render(<TagsPanel onSessionExpired={vi.fn()} />);
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('2 个标签 · 15 次照片关联')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: '搜索标签' }), { target: { value: '夜' } });
    expect(screen.getByText('夜景')).toBeInTheDocument();
    expect(screen.queryByText('城市')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清空标签搜索' }));

    fireEvent.change(screen.getByRole('textbox', { name: '新标签名称' }), { target: { value: ' 人像 ' } });
    fireEvent.click(screen.getByRole('button', { name: '创建标签' }));
    await waitFor(() => expect(tagService.createTag).toHaveBeenCalledWith('人像'));

    fireEvent.click(screen.getByRole('button', { name: '重命名 城市' }));
    fireEvent.change(screen.getByRole('textbox', { name: '重命名 城市' }), { target: { value: '街道' } });
    fireEvent.click(screen.getByRole('button', { name: '保存 城市' }));
    await waitFor(() => expect(tagService.renameTag).toHaveBeenCalledWith(1, '街道'));
  });

  it('explains the impact before deleting an in-use tag', async () => {
    render(<TagsPanel onSessionExpired={vi.fn()} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '删除 城市' }));
    expect(screen.getByRole('dialog', { name: '删除标签“城市”？' })).toBeInTheDocument();
    expect(screen.getByText('将从 12 张照片中移除该标签，照片记录和图片文件不会被删除。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(tagService.deleteTag).toHaveBeenCalledWith(1));
  });
});
