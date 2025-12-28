# 项目设置指南

## 环境要求

- Node.js >= 18.0.0
- npm 或 yarn

## 安装步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量（可选）

创建 `.env.local` 文件（如果不存在）：

```env
# API 配置
VITE_API_BASE_URL=http://localhost:3001/api

# 服务器配置
PORT=3001
NODE_ENV=development
```

### 3. 启动项目

**方式一：分别启动前端和后端（推荐开发时使用）**

```bash
# 终端 1：启动后端服务器
npm run dev:server

# 终端 2：启动前端开发服务器
npm run dev
```

**方式二：使用并发工具（需要安装 concurrently）**

```bash
npm install -D concurrently
```

然后在 `package.json` 中添加：

```json
"scripts": {
  "dev:all": "concurrently \"npm run dev:server\" \"npm run dev\""
}
```

## 访问地址

- 前端：http://localhost:3000
- 后端 API：http://localhost:3001
- API 健康检查：http://localhost:3001/health

## 数据库

- 数据库文件：`data/gallery.db`（首次启动时自动创建）
- 表结构：`database/schema.sql`（自动初始化）

## 项目结构

```
fluent-gallery/
├── components/          # React 组件
├── database/           # 数据库相关
│   ├── dao/           # 数据访问层
│   ├── schema.sql     # 数据库表结构
│   └── types.ts       # 数据库类型定义
├── server/            # 后端服务器
│   └── routes/        # API 路由
├── services/          # 前端服务层
└── types.ts           # 前端类型定义
```

## 开发说明

### 数据库访问层（DAO）

- `PhotoDao` - 照片数据访问
- `TagDao` - 标签数据访问

### API 路由

- `/api/photos` - 照片相关接口
- `/api/tags` - 标签相关接口

### 前端服务

- `photoService` - 照片服务（调用后端 API）

## 下一步：集成 OSS

当前数据库和 API 已就绪，可以开始集成 OSS 存储：

1. 安装 OSS SDK（如阿里云 OSS、腾讯云 COS 等）
2. 配置 OSS 凭证
3. 实现文件上传接口
4. 更新照片创建流程

