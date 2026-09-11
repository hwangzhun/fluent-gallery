import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Check, Cloud, Edit3, List, Plus, RefreshCw, Search, Tag, Trash2, X } from 'lucide-react';
import { tagService, type TagWithCount } from '../../api/tagService';

function isSessionError(message: string) {
  return /登录|会话|认证/.test(message);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function DeleteTagDialog({ tag, busy, onCancel, onConfirm }: { tag: TagWithCount; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="studio-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-tag-title">
    <div className="studio-dialog-card">
      <p className="studio-eyebrow">DELETE TAG</p>
      <h2 id="delete-tag-title">删除标签“{tag.name}”？</h2>
      <p>{tag.photoCount > 0 ? `将从 ${tag.photoCount} 张照片中移除该标签，照片记录和图片文件不会被删除。` : '该标签尚未关联照片，删除后无法恢复。'}</p>
      <div className="studio-dialog-actions">
        <button type="button" onClick={onCancel} disabled={busy}>取消</button>
        <button type="button" className="is-danger" onClick={onConfirm} disabled={busy}>{busy ? '正在删除…' : '确认删除'}</button>
      </div>
    </div>
  </div>;
}

export function TagsPanel({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleting, setDeleting] = useState<TagWithCount | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);
  const [view, setView] = useState<'list' | 'cloud'>(() => localStorage.getItem('fluent-gallery-admin-tags-view') === 'cloud' ? 'cloud' : 'list');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    tagService.getAdminTags()
      .then(items => { if (active) setTags(items); })
      .catch(reason => {
        if (!active) return;
        const message = reason instanceof Error ? reason.message : '标签加载失败';
        if (isSessionError(message)) onSessionExpired(); else setError(message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [onSessionExpired, reloadVersion]);

  const filteredTags = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return keyword ? tags.filter(tag => tag.name.toLocaleLowerCase().includes(keyword)) : tags;
  }, [query, tags]);
  const totalAssociations = useMemo(() => tags.reduce((sum, tag) => sum + tag.photoCount, 0), [tags]);
  const cloudRange = useMemo(() => {
    const counts = filteredTags.map(tag => tag.photoCount);
    return { min: Math.min(...counts, 0), max: Math.max(...counts, 0) };
  }, [filteredTags]);
  const cloudSize = (count: number) => cloudRange.max === cloudRange.min ? 18 : 14 + ((count - cloudRange.min) / (cloudRange.max - cloudRange.min)) * 20;

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
  };
  const handleError = (reason: unknown, fallback: string) => {
    const message = reason instanceof Error ? reason.message : fallback;
    if (isSessionError(message)) onSessionExpired(); else showNotice(message);
  };
  const reload = () => setReloadVersion(value => value + 1);

  const createTag = async (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    if (tags.some(tag => tag.name === name)) { showNotice('该标签已存在'); return; }
    setBusy(true);
    try {
      await tagService.createTag(name);
      setNewName('');
      reload();
      showNotice('标签已创建');
    } catch (reason) { handleError(reason, '创建标签失败'); }
    finally { setBusy(false); }
  };

  const beginRename = (tag: TagWithCount) => { setEditingId(tag.id); setEditingName(tag.name); };
  const renameTag = async (tag: TagWithCount) => {
    const name = editingName.trim();
    if (!name || busy) return;
    if (name === tag.name) { setEditingId(null); return; }
    setBusy(true);
    try {
      await tagService.renameTag(tag.id, name);
      setEditingId(null);
      reload();
      showNotice('标签已重命名');
    } catch (reason) { handleError(reason, '标签重命名失败'); }
    finally { setBusy(false); }
  };

  const deleteTag = async () => {
    if (!deleting || busy) return;
    setBusy(true);
    try {
      await tagService.deleteTag(deleting.id);
      setDeleting(null);
      reload();
      showNotice('标签已删除，照片保持不变');
    } catch (reason) { handleError(reason, '删除标签失败'); }
    finally { setBusy(false); }
  };

  return <section className="studio-tags" aria-busy={loading}>
    <div className="studio-tags-toolbar">
      <div className="studio-tags-search">
        <Search size={17} aria-hidden="true" />
        <input aria-label="搜索标签" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标签名称…" />
        {query && <button type="button" aria-label="清空标签搜索" onClick={() => setQuery('')}><X size={15} /></button>}
      </div>
      <form className="studio-tag-create" onSubmit={createTag}>
        <input aria-label="新标签名称" value={newName} onChange={event => setNewName(event.target.value)} placeholder="输入新标签名称" maxLength={50} />
        <button type="submit" disabled={!newName.trim() || busy}><Plus size={17} />创建标签</button>
      </form>
    </div>

    <div className="studio-tags-summary">
      <div><h2>全部标签</h2><p>{tags.length} 个标签 · {totalAssociations} 次照片关联</p></div>
      <div className="flex items-center gap-3"><div className="inline-flex border border-slate-300 p-1"><button type="button" aria-label="标签列表视图" aria-pressed={view === 'list'} onClick={() => { setView('list'); localStorage.setItem('fluent-gallery-admin-tags-view', 'list'); }} className={`p-1.5 ${view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}><List size={16} /></button><button type="button" aria-label="标签云视图" aria-pressed={view === 'cloud'} onClick={() => { setView('cloud'); localStorage.setItem('fluent-gallery-admin-tags-view', 'cloud'); }} className={`p-1.5 ${view === 'cloud' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}><Cloud size={16} /></button></div>{error && <button type="button" onClick={reload}><RefreshCw size={15} />重新加载</button>}</div>
    </div>

    {loading && tags.length === 0 ? <div className="studio-tags-state" role="status"><RefreshCw className="studio-spin" size={25} /><p>正在整理标签…</p></div>
      : error && tags.length === 0 ? <div className="studio-tags-state is-error"><Tag size={28} /><h3>无法加载标签</h3><p>{error}</p></div>
      : filteredTags.length === 0 ? <div className="studio-tags-state"><Tag size={28} /><h3>{query ? '没有找到匹配的标签' : '还没有标签'}</h3><p>{query ? '试试其他关键词。' : '在上方创建第一个标签。'}</p></div>
      : view === 'cloud' ? <div className="studio-tag-cloud" aria-label="标签使用统计">{[...filteredTags].sort((a, b) => b.photoCount - a.photoCount || a.name.localeCompare(b.name, 'zh-CN')).map(tag => <span key={tag.id} className="studio-tag-cloud-item" style={{ fontSize: `${cloudSize(tag.photoCount)}px` }} title={`${tag.name}：${tag.photoCount} 张照片`}>{tag.name}<small>{tag.photoCount} 张</small></span>)}</div> : <div className="studio-tags-list">
        <div className="studio-tag-row studio-tag-heading" aria-hidden="true"><span>标签名称</span><span>关联照片</span><span>创建日期</span><span>操作</span></div>
        {filteredTags.map(tag => <div className="studio-tag-row" key={tag.id}>
          <div className={`studio-tag-name ${editingId === tag.id ? 'is-editing' : ''}`}>
            <Tag size={15} aria-hidden="true" />
            {editingId === tag.id ? <form className="studio-tag-edit" onSubmit={event => { event.preventDefault(); void renameTag(tag); }}>
              <input autoFocus aria-label={`重命名 ${tag.name}`} value={editingName} onChange={event => setEditingName(event.target.value)} maxLength={50} />
              <button type="submit" aria-label={`保存 ${tag.name}`} disabled={!editingName.trim() || busy}><Check size={16} /></button>
              <button type="button" aria-label={`取消重命名 ${tag.name}`} onClick={() => setEditingId(null)}><X size={16} /></button>
            </form> : <strong>{tag.name}</strong>}
          </div>
          <div className="studio-tag-count"><span>{tag.photoCount}</span><small>张</small></div>
          <time className="studio-tag-date" dateTime={tag.created_at}>{formatDate(tag.created_at)}</time>
          <div className="studio-tag-actions">
            <button type="button" aria-label={`重命名 ${tag.name}`} onClick={() => beginRename(tag)} disabled={busy || editingId !== null}><Edit3 size={16} /></button>
            <button type="button" aria-label={`删除 ${tag.name}`} onClick={() => setDeleting(tag)} disabled={busy}><Trash2 size={16} /></button>
          </div>
        </div>)}
      </div>}

    {notice && <div role="status" className="studio-toast">{notice}</div>}
    {deleting && <DeleteTagDialog tag={deleting} busy={busy} onCancel={() => setDeleting(null)} onConfirm={() => void deleteTag()} />}
  </section>;
}
