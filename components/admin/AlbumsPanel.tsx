import React, { useCallback, useEffect, useState } from 'react';
import { albumService, type Album, type AlbumDetail } from '../../api/albumService';
import { PhotoImage } from '../PhotoImage';
import { AlbumPhotoPicker } from './AlbumPhotoPicker';

function move<T>(items: T[], index: number, offset: number): T[] {
  const next = [...items];
  [next[index], next[index + offset]] = [next[index + offset], next[index]];
  return next;
}
export function AlbumsPanel({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [editor, setEditor] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  const [deleting, setDeleting] = useState<Album | null>(null);
  const report = useCallback((reason: unknown) => {
    const message = reason instanceof Error ? reason.message : '画册操作失败';
    setError(message); if (/登录|会话|认证/.test(message)) onSessionExpired();
  }, [onSessionExpired]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    albumService.list(true).then(data => { if (active) setAlbums(data); }).catch(reason => { if (active) report(reason); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version, report]);
  const action = async (work: () => Promise<unknown>, message = '') => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await work(); setNotice(message); setVersion(v => v + 1); }
    catch (reason) { report(reason); }
    finally { setBusy(false); }
  };
  const open = (album: Album) => action(async () => setEditor(await albumService.detail(album.id, true)));
  const save = (event: React.FormEvent) => {
    event.preventDefault(); if (!editor) return;
    void action(async () => {
      await albumService.save(editor.id || null, { name: editor.name, description: editor.description, published: editor.published, coverPhotoId: editor.coverPhotoId, photoIds: editor.photos.map(photo => photo.id) });
      setEditor(null);
    }, '画册已保存');
  };
  const publish = (album: Album) => action(async () => {
    const detail = await albumService.detail(album.id, true);
    await albumService.save(album.id, { ...detail, published: !album.published, photoIds: detail.photos.map(photo => photo.id) });
  }, album.published ? '已取消发布' : '画册已发布');
  return <div className="albums-admin">
    {error && <p role="alert" className="album-error">{error}<button onClick={() => { setError(''); setVersion(v => v + 1); }}>重新加载</button></p>}
    {notice && <p role="status">{notice}</p>}
    {editor ? <form onSubmit={save}>
      <div className="album-editor-heading"><h2>{editor.id ? '编辑画册' : '新建画册'}</h2><div className="album-actions"><button type="button" disabled={busy} onClick={() => { if (window.confirm('放弃尚未保存的画册修改？')) { setEditor(null); setError(''); } }}>取消</button><button type="submit" disabled={busy} className="album-primary">{busy ? '正在保存…' : '保存画册'}</button></div></div>
      <fieldset disabled={busy} className="album-metadata">
        <label>画册名称<input required maxLength={200} value={editor.name} onChange={event => setEditor({ ...editor, name: event.target.value })} /></label>
        <label>简介<textarea rows={3} maxLength={5000} value={editor.description} onChange={event => setEditor({ ...editor, description: event.target.value })} /></label>
        <label className="album-publish"><input type="checkbox" checked={editor.published} onChange={event => setEditor({ ...editor, published: event.target.checked })} />发布到前台</label>
        {!editor.photos.length && <p className="album-help">空画册不会在前台展示；首次发布前请先添加照片。</p>}
      </fieldset>
      <div className="album-editor-columns"><section className="album-members"><h3>照片编排 · {editor.photos.length} 张</h3><p className="album-help">按此顺序展映，封面可独立选择。</p>
        <label className="album-cover-auto"><input type="radio" name="album-cover" checked={editor.coverPhotoId === null} disabled={busy} onChange={() => setEditor({ ...editor, coverPhotoId: null })} />自动使用第一张作为封面</label>
        {editor.photos.map((photo, index) => <article key={photo.id} className="album-member"><PhotoImage photo={photo} /><div><p>{index + 1}. {photo.title}</p><div className="album-actions"><button type="button" aria-label={`上移 ${photo.title}`} disabled={busy || index === 0} onClick={() => setEditor({ ...editor, photos: move(editor.photos, index, -1) })}>上移</button><button type="button" aria-label={`下移 ${photo.title}`} disabled={busy || index === editor.photos.length - 1} onClick={() => setEditor({ ...editor, photos: move(editor.photos, index, 1) })}>下移</button><button type="button" disabled={busy} onClick={() => setEditor({ ...editor, photos: editor.photos.filter(item => item.id !== photo.id), coverPhotoId: editor.coverPhotoId === photo.id ? null : editor.coverPhotoId })}>移除</button><label><input type="radio" name="album-cover" checked={editor.coverPhotoId === photo.id} disabled={busy} onChange={() => setEditor({ ...editor, coverPhotoId: photo.id })} />封面</label></div></div></article>)}
      </section><AlbumPhotoPicker selected={editor.photos} disabled={busy} onSessionExpired={onSessionExpired} onChange={photos => setEditor({ ...editor, photos, coverPhotoId: photos.some(photo => photo.id === editor.coverPhotoId) ? editor.coverPhotoId : null })} /></div>
    </form> : <>
      <div className="album-editor-heading"><p>{albums.length} 本画册</p><button className="album-primary" disabled={busy} onClick={() => { setError(''); setNotice(''); setEditor({ id: '', name: '', description: '', published: false, coverPhotoId: null, photos: [] }); }}>新建画册</button></div>
      {loading ? <p role="status">正在加载画册…</p> : !albums.length && !error ? <div className="album-admin-empty">还没有画册。新建一本，从照片库中选片开始。</div> : <div className="album-admin-list">{albums.map((album, index) => <article key={album.id}>
        <div className="album-admin-preview">{album.previews[0] ? <PhotoImage photo={album.previews[0]} /> : <span>暂无照片</span>}</div><div className="album-admin-summary"><h3>{album.name}</h3><p>{album.published ? '已发布' : '草稿'} · {album.photoCount} 张照片</p>{album.description && <p>{album.description}</p>}{album.published && !album.photoCount && <p>前台已隐藏，请补充照片。</p>}
          <div className="album-actions"><button disabled={busy} onClick={() => void open(album)}>编辑</button><button disabled={busy || (!album.published && !album.photoCount)} onClick={() => void publish(album)}>{album.published ? '取消发布' : '发布'}</button><button disabled={busy || index === 0} aria-label={`上移画册 ${album.name}`} onClick={() => void action(() => albumService.reorder(move<Album>(albums, index, -1).map(item => item.id)))}>上移</button><button disabled={busy || index === albums.length - 1} aria-label={`下移画册 ${album.name}`} onClick={() => void action(() => albumService.reorder(move<Album>(albums, index, 1).map(item => item.id)))}>下移</button><button disabled={busy} onClick={() => setDeleting(album)}>删除</button></div>
        </div>
      </article>)}</div>}
      {deleting && <div className="album-delete-confirm" role="alert"><p>删除画册“{deleting.name}”？照片仍保留在照片库中。</p><div className="album-actions"><button disabled={busy} onClick={() => setDeleting(null)}>取消</button><button disabled={busy} onClick={() => void action(async () => { await albumService.remove(deleting.id); setDeleting(null); }, '画册已删除')}>确认删除画册</button></div></div>}
    </>}
  </div>;
}
