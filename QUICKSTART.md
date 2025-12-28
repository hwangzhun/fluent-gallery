# 快速启动指南

## 前置要求

- Node.js 18+ 
- npm 或 yarn

## 安装依赖

```bash
npm install
```

## 启动项目

### 1. 启动后端服务器

```bash
npm run dev:server
```

后端服务器将运行在 `http://localhost:3001`

### 2. 启动前端开发服务器

在新的终端窗口中：

```bash
npm run dev
```

前端应用将运行在 `http://localhost:3000`

## 数据库

- 数据库文件会自动创建在 `data/gallery.db`
- 首次启动时会自动初始化表结构
- 数据库文件已添加到 `.gitignore`，不会被提交到版本控制

## 环境变量（可选）

如果需要自定义 API 地址，创建 `.env.local` 文件：

```env
VITE_API_BASE_URL=http://localhost:3001/api
```

## API 测试

### 健康检查
```bash
curl http://localhost:3001/health
```

### 获取所有照片
```bash
curl http://localhost:3001/api/photos
```

### 创建照片
```bash
curl -X POST http://localhost:3001/api/photos \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/photo.jpg",
    "thumbnail_url": "https://example.com/thumb.jpg",
    "title": "测试照片",
    "year": 2024,
    "width": 1200,
    "height": 800,
    "tags": ["Nature", "Test"]
  }'
```

## 项目结构

```
fluent-gallery/
├── server/           # 后端服务器
│   ├── index.ts     # 服务器入口
│   └── routes/      # API 路由
├── database/         # 数据库相关
│   ├── schema.sql   # 数据库表结构
│   ├── db.ts        # 数据库连接
│   └── dao/         # 数据访问层
├── services/         # 前端服务
│   └── photoService.ts
└── components/       # React 组件
```

## 下一步

1. ✅ 数据库和 API 已完成
2. 🔄 接下来可以集成 OSS 存储
3. 📸 实现图片上传功能

