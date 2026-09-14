import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiService } from './aiService';

describe('aiService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns generated metadata from a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { title: '晚风里的灯', tags: ['城市', '夜景', '街头'] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(aiService.suggestMetadataForPhoto('photo-1')).resolves.toEqual({
      title: '晚风里的灯',
      tags: ['城市', '夜景', '街头'],
    });
  });

  it('generates only a title for an uploaded file', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { title: '雨落长街' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(aiService.suggestTitle(new File(['image'], 'street.jpg', { type: 'image/jpeg' }))).resolves.toBe('雨落长街');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/ai/title'), expect.objectContaining({ method: 'POST', body: expect.any(FormData) }));
  });

  it('generates only a title for a stored photo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { title: '远山入云' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(aiService.suggestTitleForPhoto('photo-2')).resolves.toBe('远山入云');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/ai/title/photo'), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ photoId: 'photo-2' }),
    }));
  });

  it('reports an invalid service response instead of exposing a JSON parse error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(aiService.suggestMetadataForPhoto('photo-1')).rejects.toThrow('AI 服务返回了无效响应（HTTP 404）');
  });

  it('preserves a structured server error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false,
      error: '请先配置 API Key',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } })));

    await expect(aiService.suggestMetadataForPhoto('photo-1')).rejects.toThrow('请先配置 API Key');
  });
});
