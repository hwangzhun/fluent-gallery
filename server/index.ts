import albumsRoutes from './routes/albums';
import express from 'express';
import cors from 'cors';
import { initDatabase } from '../database/db';
import photoRoutes from './routes/photos';
import tagRoutes from './routes/tags';
import ossRoutes from './routes/oss';
import uploadRoutes from './routes/upload';
import settingsRoutes from './routes/settings';
import { ensureSettingsSchema } from './routes/settings';
import logsRoutes from './routes/logs';
import likeRoutes from './routes/likes';
import viewRoutes from './routes/views';
import authRoutes, { ensureAuthSchema, requireAdmin } from './auth';
import { storageConfig, refreshStorageConfig } from './storage/config';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import aiRoutes from './routes/ai';
import { installFileLogger, requestLogger } from './logger';

const app = express();
const PORT = process.env.PORT || 3001;

// 管理后台的系统日志读取 logs/*.log；服务启动时接通实际的日志落盘链路。
installFileLogger();

// 中间件
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('不允许的跨域来源'));
  }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// 静态文件服务（本地模式）
if (storageConfig.mode === 'local' && storageConfig.local) {
  const uploadDir = join(process.cwd(), storageConfig.local.uploadDir.replace('./', ''));
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadDir));
  console.log('📁 本地文件服务已启用:', storageConfig.local.publicUrl);
}

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Fluent Gallery API 运行正常' });
});

// API 路由
// 注意：点赞和浏览量路由需要在照片路由之前注册，避免路由冲突
app.use('/api/photos', likeRoutes); // 点赞路由（挂载在 /api/photos 下）
app.use('/api/photos', viewRoutes); // 浏览量路由（挂载在 /api/photos 下）
app.use('/api/photos', photoRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/albums', albumsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/oss', requireAdmin, ossRoutes);
app.use('/api/upload', requireAdmin, uploadRoutes);
// 图库的公开展示设置由路由自行控制权限，其他设置仍需要管理员会话。
app.use('/api/settings', settingsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/logs', requireAdmin, logsRoutes);

function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char)); }
async function renderIndexHtml() {
  const indexPath = join(process.cwd(), 'dist', 'index.html');
  let html = readFileSync(indexPath, 'utf8');
  const row = await (await import('../database/db')).dbGet<{ value: string }>("SELECT value FROM settings WHERE key = 'seo_config'");
  const defaults = { title: 'Fluent Gallery | Hwangzhun 摄影作品集', description: 'Fluent Gallery 是 Hwangzhun 的个人摄影画廊，记录光影、城市、自然与日常片刻。', keywords: 'Fluent Gallery, Hwangzhun, 摄影, 摄影作品集, 个人画廊, 光影, 城市摄影', author: 'Hwangzhun', canonicalUrl: '', ogTitle: '', ogDescription: '', ogImage: '' };
  let seo = defaults;
  try { seo = { ...defaults, ...(row ? JSON.parse(row.value) : {}) }; } catch { /* use defaults */ }
  const replace = (pattern: RegExp, value: string) => html = html.replace(pattern, value);
  replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(seo.title)}</title>`);
  replace(/(<meta name="description" content=")[^"]*(" \/>)/, `$1${escapeHtml(seo.description)}$2`);
  replace(/(<meta name="keywords" content=")[^"]*(" \/>)/, `$1${escapeHtml(seo.keywords)}$2`);
  replace(/(<meta name="author" content=")[^"]*(" \/>)/, `$1${escapeHtml(seo.author)}$2`);
  replace(/(<link rel="canonical" href=")[^"]*(" \/>)/, `$1${escapeHtml(seo.canonicalUrl)}$2`);
  replace(/(<meta property="og:title" content=")[^"]*(" \/>)/, `$1${escapeHtml(seo.ogTitle || seo.title)}$2`);
  replace(/(<meta property="og:description" content=")[^"]*(" \/>)/, `$1${escapeHtml(seo.ogDescription || seo.description)}$2`);
  replace(/(<meta property="og:image" content=")[^"]*(" \/>)/, `$1${escapeHtml(seo.ogImage)}$2`);
  return html;
}

const distDir = join(process.cwd(), 'dist');
if (process.env.NODE_ENV === 'production' && existsSync(distDir)) {
  app.use(express.static(distDir, { index: false }));
  app.get('*', async (_request, response, next) => {
    try { response.type('html').send(await renderIndexHtml()); } catch (error) { next(error); }
  });
}

// 404 处理
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// 错误处理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ 服务器错误:', err);
  res.status(500).json({ 
    error: '服务器内部错误',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 启动服务器
async function startServer() {
  try {
    // 初始化数据库
    await initDatabase();
    await ensureAuthSchema();
    await ensureSettingsSchema();
    console.log('✅ 数据库初始化完成');

    // 从数据库刷新存储配置
    await refreshStorageConfig();

    // 启动服务器
    app.listen(PORT, () => {
      console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
      console.log(`📖 API 文档: http://localhost:${PORT}/health`);
      console.log(`💾 存储模式: ${storageConfig.mode}`);
    });
  } catch (error) {
    console.error('❌ 启动服务器失败:', error);
    process.exit(1);
  }
}

startServer();

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n正在关闭服务器...');
  const { closeDatabase } = await import('../database/db');
  await closeDatabase();
  process.exit(0);
});
