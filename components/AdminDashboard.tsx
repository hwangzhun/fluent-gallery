import './admin/admin.css';
import React, { useEffect, useState } from 'react';
import { Image, Settings, FileText, LogOut, ExternalLink, Tags } from 'lucide-react';
import { Link } from 'react-router-dom';
import { authService } from '../services/authService';
import { PhotosPanel } from './admin/PhotosPanel';
import { SettingsPanel } from './admin/SettingsPanel';
import { LogsPanel } from './admin/LogsPanel';
import { TagsPanel } from './admin/TagsPanel';
import { AdminLogin } from './admin/AdminLogin';

type Section = 'photos' | 'tags' | 'settings' | 'logs';
const sections: Array<{ id: Section; label: string; icon: typeof Image }> = [{ id: 'photos', label: '照片管理', icon: Image }, { id: 'tags', label: '标签管理', icon: Tags }, { id: 'settings', label: '系统设置', icon: Settings }, { id: 'logs', label: '系统日志', icon: FileText }];

export const AdminDashboard: React.FC = () => {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null); const [section, setSection] = useState<Section>('photos');
  useEffect(() => { authService.session().then(result => setAuthenticated(Boolean(result.authenticated))).catch(() => setAuthenticated(false)); }, []);
  const logout = async () => { await authService.logout().catch(() => undefined); setAuthenticated(false); };
  if (authenticated === null) return <div className="admin-shell admin-session" role="status">正在验证管理员会话…</div>;
  if (!authenticated) return <AdminLogin onSuccess={() => setAuthenticated(true)} />;
  const active = sections.find(item => item.id === section)!;
  const content = section === 'photos' ? <PhotosPanel onSessionExpired={() => setAuthenticated(false)} /> : section === 'tags' ? <TagsPanel onSessionExpired={() => setAuthenticated(false)} /> : section === 'settings' ? <SettingsPanel onSessionExpired={() => setAuthenticated(false)} /> : <LogsPanel onSessionExpired={() => setAuthenticated(false)} />;
  return <div className="admin-shell">
    <header className="studio-header"><Link to="/" className="studio-brand"><span className="studio-mark" aria-hidden="true">f<span>.</span></span><span>Fluent Gallery<small>画 廊 工 作 室</small></span></Link><div className="studio-header-actions"><Link to="/">查看图库 <ExternalLink size={15} /></Link><button onClick={logout}><LogOut size={16} /><span>退出登录</span></button></div></header>
    <div className="studio-layout"><aside className="studio-sidebar"><p className="studio-eyebrow">WORKSPACE</p><nav aria-label="控制台导航">{sections.map((item, index) => { const Icon = item.icon; return <button key={item.id} aria-current={section === item.id ? 'page' : undefined} onClick={() => setSection(item.id)}><span className="studio-nav-number">0{index + 1}</span><Icon size={17} strokeWidth={1.4} /><span>{item.label}</span></button>; })}</nav><div className="studio-sidebar-note">内容管理控制台<p>整理影像，延续观看。</p></div></aside>
    <main className="studio-main"><div className="studio-page-heading"><div><p className="studio-eyebrow">FLUENT GALLERY / 0{sections.findIndex(item => item.id === section) + 1}</p><h1>{active.label}</h1><p className="studio-description">{section === 'photos' ? '整理作品、补充拍摄信息，让每一幅影像各得其所。' : section === 'tags' ? '整理影像的分类线索，了解每个标签的使用情况。' : section === 'settings' ? '从展示方式到存储配置，照料画廊的日常。' : '查看运行记录，追踪画廊的每一次更新。'}</p></div><span className="studio-session-badge"><i />管理员会话</span></div><div className="studio-page-content">{content}</div><footer className="studio-footer"><span>Fluent Gallery</span><span>画廊工作室</span></footer></main></div>
  </div>;
};
