import { AlbumsPanel } from './admin/AlbumsPanel';
import './admin/admin.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Settings, FileText, LogOut, ExternalLink, Tags, BarChart3 } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authService } from '../api/authService';
import { PhotosPanel } from './admin/PhotosPanel';
import { SettingsPanel } from './admin/SettingsPanel';
import { LogsPanel } from './admin/LogsPanel';
import { TagsPanel } from './admin/TagsPanel';
import { AdminLogin } from './admin/AdminLogin';
import { EngagementPanel } from './admin/EngagementPanel';
import { EngagementApiError, engagementService, type EngagementNotificationState } from '../api/engagementService';
import { PhotoModal, type BatchUploadResult } from './PhotoModal';
import { forgetPendingUploadJobs, getPendingUploadJobIds, photoUploadService } from '../api/photoUploadService';
import brandUrl from '../logo/brand.svg';

type Section = 'albums' | 'photos' | 'engagement' | 'tags' | 'settings' | 'logs';
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.0.0';
export const formatAppVersion = (version: string) => version.replace(/-slim$/i, ' Slim');
const APP_VERSION_LABEL = formatAppVersion(APP_VERSION);
const sections: Array<{ id: Section; label: string; icon: typeof Image }> = [{ id: 'photos', label: '照片管理', icon: Image }, { id: 'engagement', label: '互动数据', icon: BarChart3 }, { id: 'albums', label: '画册管理', icon: Image }, { id: 'tags', label: '标签管理', icon: Tags }, { id: 'settings', label: '系统设置', icon: Settings }, { id: 'logs', label: '系统日志', icon: FileText }];

export const AdminDashboard: React.FC = () => {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null); const [section, setSection] = useState<Section>(() => sections.find(item => item.id === localStorage.getItem('fluent-gallery-admin-section'))?.id || 'photos');
  const location = useLocation();
  const navigate = useNavigate();
  const [photoRefreshVersion, setPhotoRefreshVersion] = useState(0);
  const [uploadNotice, setUploadNotice] = useState('');
  const [engagementNotification, setEngagementNotification] = useState<EngagementNotificationState>({ unreadLikes: 0, latestLikeAt: null, lastReadAt: null });
  const uploadTrackers = useRef(new Set<AbortController>());
  const onSessionExpired = useCallback(() => setAuthenticated(false), []);
  const onEngagementNotificationChange = useCallback((state: EngagementNotificationState) => setEngagementNotification(state), []);
  useEffect(() => { authService.session().then(result => setAuthenticated(Boolean(result.authenticated))).catch(() => setAuthenticated(false)); }, []);
  useEffect(() => () => {
    uploadTrackers.current.forEach(controller => controller.abort());
    uploadTrackers.current.clear();
  }, []);
  const logout = async () => { await authService.logout().catch(() => undefined); setAuthenticated(false); };
  const showUploadNotice = (message: string) => {
    setUploadNotice(message);
    window.setTimeout(() => setUploadNotice(''), 3200);
  };
  const trackWorkspaceJobs = (jobIds: string[]) => {
    const controller = new AbortController();
    uploadTrackers.current.add(controller);
    void (async () => {
      const pending = new Set(jobIds);
      let completed = 0;
      let failed = 0;
      let failureMessage = '';
      let requestFailures = 0;
      for (let poll = 0; poll < 120 && pending.size > 0 && !controller.signal.aborted; poll += 1) {
        try {
          const statuses = await photoUploadService.getJobStatuses([...pending], controller.signal);
          requestFailures = 0;
          let changed = false;
          const returnedIds = new Set(statuses.map(status => status.id));
          const missingIds = [...pending].filter(id => !returnedIds.has(id));
          if (missingIds.length) {
            missingIds.forEach(id => pending.delete(id));
            forgetPendingUploadJobs(missingIds);
            failed += missingIds.length;
            failureMessage ||= '部分图片处理任务已丢失，请重新上传';
            changed = true;
          }
          statuses.forEach(status => {
            if (status.status === 'completed') { pending.delete(status.id); forgetPendingUploadJobs([status.id]); completed += 1; changed = true; }
            if (status.status === 'failed') { pending.delete(status.id); forgetPendingUploadJobs([status.id]); failed += 1; failureMessage ||= status.error || ''; changed = true; }
          });
          if (changed) setPhotoRefreshVersion(value => value + 1);
          if (pending.size === 0) {
            showUploadNotice(failed ? (failureMessage || `处理完成 ${completed} 张，${failed} 张失败，源文件已保留`) : `已完成 ${completed} 张照片处理`);
            return;
          }
        } catch (reason) {
          if (controller.signal.aborted) return;
          requestFailures += 1;
          const message = reason instanceof Error ? reason.message : '查询图片处理状态失败';
          if (/登录|会话|认证/.test(message)) { onSessionExpired(); return; }
          if (requestFailures >= 3) { showUploadNotice(message); return; }
        }
        await new Promise(resolve => window.setTimeout(resolve, 1_500));
      }
      if (!controller.signal.aborted && pending.size > 0) showUploadNotice(`${pending.size} 张照片仍在后台处理`);
    })().finally(() => uploadTrackers.current.delete(controller));
  };
  const completeWorkspaceUpload = (result: BatchUploadResult) => {
    if (result.photos.length) setPhotoRefreshVersion(value => value + 1);
    if (result.jobs.length) trackWorkspaceJobs(result.jobs.map(job => job.jobId));
    showUploadNotice(result.failed
      ? `已提交 ${result.succeeded} 张，${result.failed} 张上传失败`
      : result.jobs.length ? `已提交 ${result.jobs.length} 张后台处理` : `已上传 ${result.succeeded} 张照片`);
  };
  useEffect(() => {
    if (!authenticated) return;
    const pendingJobIds = getPendingUploadJobIds();
    if (pendingJobIds.length) trackWorkspaceJobs(pendingJobIds);
    // Resume browser-direct jobs interrupted by a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);
  useEffect(() => {
    if (!authenticated) return;
    const controller = new AbortController();
    const refresh = () => engagementService.getNotifications(controller.signal).then(onEngagementNotificationChange).catch(reason => {
      if (controller.signal.aborted) return;
      if (reason instanceof EngagementApiError && reason.status === 401) onSessionExpired();
    });
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [authenticated, onEngagementNotificationChange, onSessionExpired]);
  if (authenticated === null) return <div className="admin-shell admin-session" role="status">正在验证管理员会话…</div>;
  if (!authenticated) return <AdminLogin onSuccess={() => setAuthenticated(true)} />;
  const active = sections.find(item => item.id === section)!;
  const isUploadRoute = location.pathname.replace(/\/+$/, '') === '/admin/upload';
  const content = section === 'photos' ? <PhotosPanel onSessionExpired={onSessionExpired} onOpenDesktopUpload={() => navigate('/admin/upload')} externalReloadVersion={photoRefreshVersion} /> : section === 'engagement' ? <EngagementPanel onSessionExpired={onSessionExpired} onNotificationChange={onEngagementNotificationChange} /> : section === 'albums' ? <AlbumsPanel onSessionExpired={onSessionExpired} /> : section === 'tags' ? <TagsPanel onSessionExpired={onSessionExpired} /> : section === 'settings' ? <SettingsPanel onSessionExpired={onSessionExpired} /> : <LogsPanel onSessionExpired={onSessionExpired} />;
  if (isUploadRoute) return <div className="admin-shell admin-upload-shell">
    <header className="studio-header"><Link to="/" className="studio-brand"><img src={brandUrl} alt="Fluent Gallery" /></Link><div className="studio-header-actions"><Link to="/">查看图库 <ExternalLink size={15} /></Link><button onClick={logout}><LogOut size={16} /><span>退出登录</span></button></div></header>
    <main className="studio-upload-page"><PhotoModal isOpen mode="upload" presentation="workspace" onClose={() => navigate('/admin')} onUpload={data => photoUploadService.uploadPhoto(data)} onUploadBatchComplete={completeWorkspaceUpload} /></main>
    {uploadNotice && <div role="status" className="studio-toast fixed bottom-5 right-5 z-[100] rounded-xl bg-slate-900 px-4 py-3 text-sm text-white">{uploadNotice}</div>}
  </div>;
  return <div className="admin-shell">
    <header className="studio-header"><Link to="/" className="studio-brand"><img src={brandUrl} alt="Fluent Gallery" /></Link><div className="studio-header-actions"><Link to="/">查看图库 <ExternalLink size={15} /></Link><button onClick={logout}><LogOut size={16} /><span>退出登录</span></button></div></header>
    <div className="studio-layout"><aside className="studio-sidebar"><p className="studio-eyebrow">WORKSPACE</p><nav aria-label="控制台导航">{sections.map((item, index) => { const Icon = item.icon; return <button key={item.id} aria-current={section === item.id ? 'page' : undefined} onClick={() => { setSection(item.id); localStorage.setItem('fluent-gallery-admin-section', item.id); }}><span className="studio-nav-number">0{index + 1}</span><Icon size={17} strokeWidth={1.4} /><span>{item.label}</span>{item.id === 'engagement' && engagementNotification.unreadLikes > 0 && <i className="studio-notification-dot" aria-label={`今日有 ${engagementNotification.unreadLikes} 个未读点赞`} />}</button>; })}</nav><div className="studio-sidebar-note">内容管理控制台<p>整理影像，延续观看。</p></div></aside>
    <main className="studio-main"><div className="studio-page-heading"><div><p className="studio-eyebrow">FLUENT GALLERY / 0{sections.findIndex(item => item.id === section) + 1}</p><h1>{active.label}</h1><p className="studio-description">{section === 'photos' ? '整理作品、补充拍摄信息，让每一幅影像各得其所。' : section === 'engagement' ? '从浏览与喜欢中，看见哪些影像正被人们停留。' : section === 'albums' ? '将影像集成画册，编排顺序，整理故事。' : section === 'tags' ? '整理影像的分类线索，了解每个标签的使用情况。' : section === 'settings' ? '从展示方式到存储配置，照料画廊的日常。' : '查看运行记录，追踪画廊的每一次更新。'}</p></div><span className="studio-session-badge"><i />管理员会话</span></div><div className="studio-page-content">{content}</div><footer className="studio-footer"><span>Fluent Gallery</span><span>版本 V{APP_VERSION_LABEL}</span><span>画廊工作室</span></footer></main></div>{uploadNotice && <div role="status" className="studio-toast fixed bottom-5 right-5 z-[100] rounded-xl bg-slate-900 px-4 py-3 text-sm text-white">{uploadNotice}</div>}
  </div>;
};
