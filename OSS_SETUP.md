# OSS 配置和使用指南

## 📋 方案 B 实现完成

方案 B（前端直传 OSS）已经实现完成！

## 🚀 快速开始

### 1. 配置环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
# 使用 OSS 模式
STORAGE_MODE=oss

# OSS 配置
OSS_REGION=oss-cn-hangzhou
OSS_ACCESS_KEY_ID=your_access_key_id
OSS_ACCESS_KEY_SECRET=your_access_key_secret
OSS_BUCKET=your-bucket-name
OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
```

### 2. 启动服务器

```bash
npm run dev:server
```

### 3. 启动前端

```bash
npm run dev
```

## 🔧 配置说明

### 本地模式（开发测试）

```env
STORAGE_MODE=local
LOCAL_UPLOAD_DIR=./uploads
LOCAL_PUBLIC_URL=http://localhost:3001/uploads
```

### OSS 模式（生产环境）

```env
STORAGE_MODE=oss
OSS_REGION=oss-cn-hangzhou
OSS_ACCESS_KEY_ID=your_access_key_id
OSS_ACCESS_KEY_SECRET=your_access_key_secret
OSS_BUCKET=your-bucket-name
OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
```

## 📝 工作流程

### OSS 模式上传流程

```
1. 用户选择文件
   ↓
2. 前端获取 STS 临时凭证
   GET /api/oss/sts
   ↓
3. 前端直接上传到 OSS
   使用 ali-oss SDK
   ↓
4. 获得 OSS URL
   ↓
5. 前端调用后端保存元数据
   POST /api/photos
   {
     url: "https://bucket.oss-cn-hangzhou.aliyuncs.com/...",
     thumbnailUrl: "...",
     title: "...",
     year: 2024,
     ...
   }
   ↓
6. 后端保存到数据库
```

### 本地模式上传流程

```
1. 用户选择文件
   ↓
2. 前端上传到后端
   POST /api/upload
   ↓
3. 后端保存到本地
   ↓
4. 返回本地 URL
   ↓
5. 前端调用后端保存元数据
   POST /api/photos
   ↓
6. 后端保存到数据库
```

## 🔐 安全说明

### 当前实现（开发测试）

- ⚠️ **使用主账号 AccessKey**：简化实现，适合开发测试
- ⚠️ **临时凭证直接返回主账号密钥**：不推荐生产环境

### 生产环境建议

1. **使用 RAM 子账号**
   - 创建 RAM 子账号
   - 只授予 OSS 上传权限
   - 使用子账号的 AccessKey

2. **配置 STS 服务**
   - 创建 RAM 角色
   - 配置 AssumeRole 权限
   - 使用 STS SDK 获取临时凭证

3. **限制权限**
   - 只允许上传到指定目录
   - 设置文件大小限制
   - 限制文件类型

## 📦 已实现的功能

### 后端

- ✅ OSS 配置管理
- ✅ STS 临时凭证服务（简化版）
- ✅ OSS 文件删除
- ✅ 自动判断存储模式
- ✅ 统一删除接口

### 前端

- ✅ OSS 上传服务
- ✅ STS 凭证获取
- ✅ 自动切换上传方式（本地/OSS）
- ✅ 文件路径生成
- ✅ 错误处理

## 🧪 测试步骤

### 1. 测试 OSS 模式

```bash
# 1. 配置 OSS 环境变量
STORAGE_MODE=oss
OSS_REGION=...
OSS_ACCESS_KEY_ID=...
...

# 2. 启动服务器
npm run dev:server

# 3. 启动前端
npm run dev

# 4. 访问管理后台
http://localhost:3000/#/admin

# 5. 上传照片
- 选择图片文件
- 填写标题、年份、标签
- 点击上传
- 检查是否上传到 OSS
```

### 2. 测试本地模式

```bash
# 1. 配置本地模式
STORAGE_MODE=local

# 2. 启动服务器
npm run dev:server

# 3. 上传照片
- 检查文件是否保存到 uploads/ 目录
- 检查 URL 是否为本地 URL
```

## ⚠️ 注意事项

### 1. OSS 配置

- **AccessKey 安全**：不要提交到代码库
- **Bucket 权限**：确保 Bucket 允许上传
- **CORS 配置**：如果需要前端直传，配置 CORS

### 2. 文件路径

- 文件路径格式：`photos/2024/01/15/timestamp-random.jpg`
- 缩略图路径：`thumbs/2024/01/15/timestamp-random.jpg`

### 3. 缩略图

- 当前实现：使用原图作为缩略图
- 后续优化：可以生成缩略图并上传

### 4. 错误处理

- OSS 上传失败：会显示错误信息
- 数据库保存失败：OSS 文件已上传，需要手动清理

## 🔄 后续优化

1. **缩略图生成**
   - 前端使用 canvas 生成
   - 或后端生成后上传

2. **上传进度**
   - 显示上传进度条
   - 支持断点续传

3. **STS 服务**
   - 集成真正的 STS 服务
   - 使用 RAM 角色

4. **文件处理**
   - 图片压缩
   - 格式转换
   - 水印添加

## 📚 API 文档

### 获取 STS 凭证

```
GET /api/oss/sts

Response:
{
  "success": true,
  "data": {
    "accessKeyId": "...",
    "accessKeySecret": "...",
    "securityToken": "",
    "expiration": "2024-01-15T11:00:00Z",
    "region": "oss-cn-hangzhou",
    "bucket": "your-bucket",
    "endpoint": "https://oss-cn-hangzhou.aliyuncs.com"
  }
}
```

### 获取 OSS 配置

```
GET /api/oss/config

Response:
{
  "success": true,
  "data": {
    "mode": "oss",
    "region": "oss-cn-hangzhou",
    "bucket": "your-bucket",
    "endpoint": "https://oss-cn-hangzhou.aliyuncs.com"
  }
}
```

## 🎉 完成！

方案 B 已经实现完成，可以开始使用了！

