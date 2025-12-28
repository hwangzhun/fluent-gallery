# 存储架构设计方案

## 📋 需求分析

### 核心需求
1. **双模式支持**：本地存储 + OSS 存储
2. **灵活切换**：可通过配置选择存储模式
3. **统一接口**：前端无需关心存储方式
4. **文件管理**：支持上传、删除、获取 URL

### 使用场景
- **本地模式**：开发环境、小型项目、内网部署
- **OSS 模式**：生产环境、需要 CDN 加速、多服务器部署

## 🏗️ 架构设计

### 方案一：策略模式 + 配置驱动（推荐）

```
┌─────────────────────────────────────────┐
│           前端上传请求                    │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      POST /api/upload                   │
│      (Multer 接收文件)                   │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      StorageService (抽象层)            │
│  ┌──────────────────────────────────┐  │
│  │  StorageAdapter (接口)             │  │
│  └──────────────────────────────────┘  │
│              │                          │
│    ┌─────────┴─────────┐               │
│    ▼                   ▼                │
│  LocalStorage      OSSStorage          │
│  (本地实现)        (OSS实现)            │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      返回 URL + 保存到数据库             │
└─────────────────────────────────────────┘
```

### 核心组件

#### 1. 存储适配器接口
```typescript
interface StorageAdapter {
  upload(file: File, path: string): Promise<StorageResult>;
  delete(path: string): Promise<void>;
  getUrl(path: string): string;
  generateThumbnail?(file: File, path: string): Promise<StorageResult>;
}
```

#### 2. 配置管理
```typescript
interface StorageConfig {
  mode: 'local' | 'oss';
  local?: {
    uploadDir: string;
    publicUrl: string;
  };
  oss?: {
    region: string;
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    endpoint?: string;
  };
}
```

## 📁 目录结构

```
server/
├── storage/
│   ├── index.ts              # 存储服务入口
│   ├── adapter.ts            # 存储适配器接口
│   ├── local.ts              # 本地存储实现
│   ├── oss.ts                # OSS 存储实现
│   └── config.ts             # 配置管理
├── routes/
│   ├── upload.ts             # 文件上传路由
│   └── photos.ts             # 照片路由（更新）
└── utils/
    └── image.ts               # 图片处理工具（缩略图等）
```

## 🔄 工作流程

### 上传流程
```
1. 前端选择文件
   ↓
2. 前端调用 POST /api/upload
   ↓
3. Multer 接收文件（临时存储）
   ↓
4. StorageService 根据配置选择适配器
   ↓
5. 适配器处理文件：
   - 本地：保存到 uploads/ 目录
   - OSS：上传到云存储
   ↓
6. 生成缩略图（可选）
   ↓
7. 返回 URL（本地：/uploads/xxx.jpg，OSS：https://...）
   ↓
8. 前端调用 POST /api/photos 保存元数据
```

### 删除流程
```
1. 前端调用 DELETE /api/photos/:id
   ↓
2. 从数据库获取照片 URL
   ↓
3. StorageService 根据 URL 判断存储方式
   ↓
4. 调用对应适配器的 delete 方法
   ↓
5. 从数据库删除记录
```

## 💡 实现方案对比

### 方案 A：完全后端处理（推荐）

**优点：**
- ✅ 安全性高（OSS 密钥不暴露给前端）
- ✅ 统一管理，易于维护
- ✅ 支持文件处理（压缩、缩略图）
- ✅ 支持批量操作

**缺点：**
- ❌ 文件需要先上传到后端，再转发到 OSS（增加一次传输）
- ❌ 后端需要处理大文件上传

**适用场景：**
- 需要文件处理（压缩、水印等）
- 需要统一管理
- 安全性要求高

### 方案 B：前端直传 OSS（STS 临时凭证）

**优点：**
- ✅ 文件直接上传到 OSS，速度快
- ✅ 减轻后端压力
- ✅ 支持断点续传

**缺点：**
- ❌ 需要实现 STS 临时凭证服务
- ❌ 本地模式需要单独处理
- ❌ 前端代码复杂度增加

**适用场景：**
- 大文件上传
- 高并发场景
- 对上传速度要求高

### 方案 C：混合模式（推荐用于生产）

**本地模式**：方案 A（后端处理）
**OSS 模式**：方案 B（前端直传 + STS）

**优点：**
- ✅ 兼顾两种场景的优势
- ✅ 灵活切换

**缺点：**
- ❌ 实现复杂度较高

## 🎯 推荐方案

### 阶段一：方案 A（完全后端处理）

**理由：**
1. 实现简单，快速上线
2. 统一接口，易于维护
3. 支持文件处理功能
4. 后续可升级为混合模式

### 阶段二：优化（可选）

如果 OSS 模式下上传速度成为瓶颈，再升级为：
- OSS 模式：前端直传 + STS
- 本地模式：保持后端处理

## 📦 依赖包

### 必需依赖
```json
{
  "multer": "^1.4.5-lts.1",           // 文件上传（已有）
  "sharp": "^0.33.0",                 // 图片处理（缩略图、压缩）
  "ali-oss": "^6.20.0" 或 "aws-sdk": "^2.1500.0"  // OSS SDK
}
```

### 可选依赖
```json
{
  "dotenv": "^16.3.1",                // 环境变量管理
  "uuid": "^9.0.1"                    // 生成唯一文件名
}
```

## 🔧 配置示例

### 环境变量 (.env)
```env
# 存储模式：local | oss
STORAGE_MODE=local

# 本地存储配置
LOCAL_UPLOAD_DIR=./uploads
LOCAL_PUBLIC_URL=http://localhost:3001/uploads

# OSS 配置（阿里云示例）
OSS_REGION=oss-cn-hangzhou
OSS_ACCESS_KEY_ID=your_access_key_id
OSS_ACCESS_KEY_SECRET=your_access_key_secret
OSS_BUCKET=your-bucket-name
OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
```

### 配置文件 (config/storage.ts)
```typescript
export const storageConfig = {
  mode: process.env.STORAGE_MODE || 'local',
  local: {
    uploadDir: process.env.LOCAL_UPLOAD_DIR || './uploads',
    publicUrl: process.env.LOCAL_PUBLIC_URL || 'http://localhost:3001/uploads'
  },
  oss: {
    region: process.env.OSS_REGION,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET,
    endpoint: process.env.OSS_ENDPOINT
  }
};
```

## 📝 API 设计

### 上传接口
```
POST /api/upload
Content-Type: multipart/form-data

Request:
  file: File
  generateThumbnail?: boolean

Response:
{
  "success": true,
  "data": {
    "url": "http://...",
    "thumbnailUrl": "http://...",
    "path": "photos/2024/xxx.jpg",
    "size": 1024000,
    "width": 1920,
    "height": 1080
  }
}
```

### 删除接口（更新）
```
DELETE /api/photos/:id

自动删除对应的文件（本地或 OSS）
```

## 🚀 实施步骤

### 第一步：基础架构
1. 创建存储适配器接口
2. 实现本地存储适配器
3. 创建存储服务（策略模式）
4. 添加配置文件

### 第二步：上传功能
1. 创建上传路由
2. 集成 Multer
3. 实现文件处理（尺寸获取、缩略图）
4. 更新照片创建接口

### 第三步：OSS 集成
1. 安装 OSS SDK
2. 实现 OSS 存储适配器
3. 配置 OSS 参数
4. 测试上传功能

### 第四步：删除功能
1. 更新删除接口
2. 实现文件删除逻辑
3. 处理删除失败的情况

### 第五步：前端适配
1. 更新上传组件
2. 移除临时 objectUrl 逻辑
3. 添加上传进度显示
4. 错误处理优化

## ⚠️ 注意事项

1. **文件命名**：使用 UUID 或时间戳避免冲突
2. **目录结构**：按日期组织文件（如 `2024/01/15/xxx.jpg`）
3. **文件大小限制**：设置合理的上传大小限制
4. **文件类型验证**：只允许图片格式
5. **错误处理**：完善的错误处理和回滚机制
6. **缩略图**：本地和 OSS 都支持生成缩略图
7. **清理机制**：定期清理未关联的文件

## 📊 性能考虑

### 本地模式
- 文件存储在服务器本地
- 需要配置静态文件服务
- 适合小规模使用

### OSS 模式
- 文件存储在云端
- 支持 CDN 加速
- 适合生产环境

## 🔐 安全考虑

1. **文件验证**：检查文件类型、大小
2. **路径安全**：防止路径遍历攻击
3. **权限控制**：上传接口需要认证
4. **OSS 密钥**：存储在环境变量，不提交到代码库

