import React, { useEffect, useState } from 'react';
import { albumService, type Album } from '../../services/albumService';

export function AlbumSelector({ value, onChange, disabled = false }: { value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    albumService.list(true).then(data => { if (active) setAlbums(data); })
      .catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);
  return <fieldset disabled={disabled || loading} className="album-selector">
    <legend className="sr-only">所属画册</legend>
    {loading ? <p role="status">正在加载画册…</p> : error ? <p role="alert">{error} <button type="button" onClick={() => setVersion(v => v + 1)}>重试</button></p> : !albums.length ? <p>暂无画册，请先在画册管理中新建。</p> : albums.map(album => <label key={album.id}><input type="checkbox" checked={value.includes(album.id)} onChange={e => onChange(e.target.checked ? [...value, album.id] : value.filter(id => id !== album.id))} /> <span>{album.name}{!album.published && ' · 草稿'}</span></label>)}
  </fieldset>;
}
