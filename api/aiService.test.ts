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

  it('uploads a compact JPEG preview for a large browser-decodable image', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { title: '雨落长街' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 6000, height: 4000, close }));
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue({
        width: 0,
        height: 0,
        getContext: () => ({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }),
        toBlob: (callback: BlobCallback) => callback(new Blob(['compact'], { type: 'image/jpeg' })),
      }),
    });

    const original = new File([new Uint8Array(2 * 1024 * 1024)], 'camera.jpg', { type: 'image/jpeg' });
    await aiService.suggestTitle(original);

    const body = fetchMock.mock.calls[0][1]?.body as FormData;
    const uploaded = body.get('file') as File;
    expect(uploaded).not.toBe(original);
    expect(uploaded.name).toBe('camera-ai.jpg');
    expect(uploaded.type).toBe('image/jpeg');
    expect(uploaded.size).toBeLessThan(original.size);
    expect(close).toHaveBeenCalledOnce();
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
