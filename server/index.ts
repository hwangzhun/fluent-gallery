import express from 'express';
import cors from 'cors';
import { initDatabase } from '../database/db';
import photoRoutes from './routes/photos';
import tagRoutes from './routes/tags';
import ossRoutes from './routes/oss';
import uploadRoutes from './routes/upload';
import settingsRoutes from './routes/settings';
import logsRoutes from './routes/logs';
import likeRoutes from './routes/likes';
import viewRoutes from './routes/views';
import { storageConfig, refreshStorageConfig } from './storage/config';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use('/api/oss', ossRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/logs', logsRoutes);

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

