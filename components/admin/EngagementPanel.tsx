import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Eye, Heart, LoaderCircle, RefreshCw } from 'lucide-react';
import {
  EngagementApiError,
  engagementService,
  type EngagementDays,
  type EngagementNotificationState,
  type EngagementPhotoRank,
  type EngagementReport,
  type EngagementTrendPoint,
} from '../../api/engagementService';

const ranges: EngagementDays[] = [7, 30, 90];
const number = new Intl.NumberFormat('zh-CN');

function TrendChart({ points }: { points: EngagementTrendPoint[] }) {
  const width = 760; const height = 250; const left = 42; const right = 18; const top = 18; const bottom = 42;
  const max = Math.max(1, ...points.flatMap(point => [point.likes, point.views]));
  const x = (index: number) => left + (index * (width - left - right)) / Math.max(1, points.length - 1);
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom);
  const path = (key: 'likes' | 'views') => points.map((point, index) => `${x(index)},${y(point[key])}`).join(' ');
  const labelEvery = points.length <= 7 ? 1 : points.length <= 30 ? 5 : 15;
  return <div className="studio-engagement-chart-wrap">
    <svg className="studio-engagement-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="engagement-chart-title engagement-chart-description">
      <title id="engagement-chart-title">点赞与浏览趋势</title>
      <desc id="engagement-chart-description">按天展示选定周期内的点赞和浏览数量</desc>
      {[0, .25, .5, .75, 1].map(ratio => <g key={ratio}><line x1={left} x2={width - right} y1={top + ratio * (height - top - bottom)} y2={top + ratio * (height - top - bottom)} className="chart-grid" /><text x={left - 8} y={top + ratio * (height - top - bottom) + 4} textAnchor="end">{Math.round(max * (1 - ratio))}</text></g>)}
      <polyline points={path('views')} className="chart-line is-views" />
      <polyline points={path('likes')} className="chart-line is-likes" />
      {points.map((point, index) => <g key={point.date}>
        <circle cx={x(index)} cy={y(point.views)} r="3" className="chart-point is-views"><title>{`${point.date}：浏览 ${point.views}`}</title></circle>
        <circle cx={x(index)} cy={y(point.likes)} r="3" className="chart-point is-likes"><title>{`${point.date}：点赞 ${point.likes}`}</title></circle>
        {(index % labelEvery === 0 || index === points.length - 1) && <text x={x(index)} y={height - 13} textAnchor="middle">{point.date.slice(5)}</text>}
      </g>)}
    </svg>
    <ul className="sr-only">{points.map(point => <li key={point.date}>{point.date}：点赞 {point.likes}，浏览 {point.views}</li>)}</ul>
  </div>;
}

function Ranking({ title, icon, items }: { title: string; icon: React.ReactNode; items: EngagementPhotoRank[] }) {
  return <section className="studio-engagement-section"><header><div>{icon}<h2>{title}</h2></div><span>前 10 张</span></header>
    {items.length ? <ol className="studio-engagement-ranking">{items.map((item, index) => <li key={item.id}>
      <span className="ranking-number">{String(index + 1).padStart(2, '0')}</span><img src={item.thumbnailUrl} alt="" loading="lazy" /><span className="ranking-title">{item.title}</span><strong>{number.format(item.count)}</strong>
    </li>)}</ol> : <p className="studio-engagement-empty">这个周期还没有互动记录。</p>}
  </section>;
}

export function EngagementPanel({ onSessionExpired, onNotificationChange }: { onSessionExpired: () => void; onNotificationChange: (state: EngagementNotificationState) => void }) {
  const [days, setDays] = useState<EngagementDays>(7);
  const [report, setReport] = useState<EngagementReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [markingRead, setMarkingRead] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    engagementService.getReport(days, controller.signal).then(data => { setReport(data); onNotificationChange(data.notifications); })
      .catch(reason => {
        if (controller.signal.aborted) return;
        if (reason instanceof EngagementApiError && reason.status === 401) onSessionExpired();
        else setError(reason instanceof Error ? reason.message : '无法加载互动数据');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [days, reload, onNotificationChange, onSessionExpired]);

  const cards = useMemo(() => report ? [
    ['今日点赞', report.summary.todayLikes, 'like'], ['今日浏览', report.summary.todayViews, 'view'],
    [`${days} 天点赞`, report.summary.periodLikes, 'like'], [`${days} 天浏览`, report.summary.periodViews, 'view'],
    ['累计点赞', report.summary.totalLikes, 'like'], ['累计浏览', report.summary.totalViews, 'view'],
  ] as const : [], [days, report]);

  const markRead = async () => {
    if (!report?.notifications.latestLikeAt) return;
    setMarkingRead(true); setError('');
    try {
      const state = await engagementService.markLikesRead(report.notifications.latestLikeAt);
      setReport(current => current ? { ...current, notifications: state } : current);
      onNotificationChange(state);
    } catch (reason) {
      if (reason instanceof EngagementApiError && reason.status === 401) onSessionExpired();
      else setError(reason instanceof Error ? reason.message : '标记已读失败');
    } finally { setMarkingRead(false); }
  };

  if (loading && !report) return <div className="studio-engagement-state" role="status"><LoaderCircle className="studio-spin" /><p>正在整理互动数据…</p></div>;
  if (error && !report) return <div className="studio-engagement-state is-error" role="alert"><BarChart3 /><h2>互动数据暂时无法载入</h2><p>{error}</p><button onClick={() => setReload(value => value + 1)}><RefreshCw size={15} />重新加载</button></div>;
  if (!report) return null;

  return <div className={`studio-engagement ${loading ? 'is-loading' : ''}`}>
    <div className="studio-engagement-toolbar"><div role="group" aria-label="趋势时间范围">{ranges.map(value => <button key={value} aria-pressed={days === value} onClick={() => setDays(value)}>{value} 天</button>)}</div><button className="mark-read" disabled={markingRead || report.notifications.unreadLikes === 0 || !report.notifications.latestLikeAt} onClick={() => void markRead()}><Heart size={15} />{markingRead ? '正在标记…' : report.notifications.unreadLikes ? `全部已读（${report.notifications.unreadLikes}）` : '今日已读'}</button></div>
    {error && <div className="studio-engagement-inline-error" role="alert">{error}<button onClick={() => setReload(value => value + 1)}>重试</button></div>}
    <div className="studio-engagement-cards">{cards.map(([label, value, kind]) => <article key={label}><span>{kind === 'like' ? <Heart size={16} /> : <Eye size={17} />}{label}</span><strong>{number.format(value)}</strong></article>)}</div>
    <section className="studio-engagement-section studio-trend"><header><div><BarChart3 size={18} /><h2>每日趋势</h2></div><div className="studio-chart-legend"><span className="is-likes" />点赞<span className="is-views" />浏览</div></header><TrendChart points={report.trend} /></section>
    <div className="studio-engagement-rankings"><Ranking title="最多点赞" icon={<Heart size={18} />} items={report.topLikes} /><Ranking title="最多浏览" icon={<Eye size={19} />} items={report.topViews} /></div>
    <section className="studio-engagement-section studio-recent-likes"><header><div><Heart size={18} /><h2>最近点赞</h2></div><span>最近 20 条</span></header>
      {report.recentLikes.length ? <ul>{report.recentLikes.map(item => <li key={item.id}><img src={item.thumbnailUrl} alt="" loading="lazy" /><span>{item.title}</span><time dateTime={item.createdAt}>{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</time></li>)}</ul> : <p className="studio-engagement-empty">还没有收到点赞。</p>}
    </section>
  </div>;
}
