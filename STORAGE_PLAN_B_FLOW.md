# 方案 B：前端直传 OSS 完整流程

## ✅ 数据库保存说明

**答案：完全可以！** 方案 B 中，数据库会保存所有照片元数据，包括 OSS URL。

## 🔄 完整工作流程

### 流程一：上传照片（OSS 模式）

```
┌─────────────┐
│   前端选择   │
│   图片文件   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│ 1. 前端请求 STS 临时凭证          │
│    GET /api/oss/sts              │
│    → 返回临时 AccessKey          │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 2. 前端直接上传到 OSS            │
│    使用临时凭证 + OSS SDK        │
│    → 上传成功，获得 OSS URL      │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 3. 前端调用后端 API 保存元数据   │
│    POST /api/photos              │
│    Body: {                       │
│      url: "https://oss.../xxx.jpg",│
│      thumbnailUrl: "...",        │
│      title: "...",               │
│      year: 2024,                 │
│      tags: [...],                │
│      width: 1920,                │
│      height: 1080                │
│    }                             │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 4. 后端保存到数据库              │
│    - 保存 OSS URL                │
│    - 保存缩略图 URL              │
│    - 保存元数据（标题、年份等）   │
│    - 保存标签关联                │
└─────────────────────────────────┘
```

### 流程二：上传照片（本地模式）

```
┌─────────────┐
│   前端选择   │
│   图片文件   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│ 1. 前端上传到后端                │
│    POST /api/upload              │
│    (FormData with file)          │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 2. 后端保存到本地                │
│    - 保存到 uploads/ 目录        │
│    - 生成缩略图                  │
│    - 返回本地 URL                │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 3. 前端调用后端 API 保存元数据   │
│    POST /api/photos              │
│    Body: {                       │
│      url: "/uploads/xxx.jpg",    │
│      thumbnailUrl: "...",       │
│      ...                         │
│    }                             │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 4. 后端保存到数据库              │
│    (同 OSS 模式)                 │
└─────────────────────────────────┘
```

## 📊 数据库保存的数据

### photos 表保存的内容

```sql
{
  id: "photo-123",
  url: "https://your-bucket.oss-cn-hangzhou.aliyuncs.com/photos/2024/xxx.jpg",  -- OSS URL
  thumbnail_url: "https://your-bucket.oss-cn-hangzhou.aliyuncs.com/thumbs/xxx.jpg",  -- 缩略图 URL
  title: "美丽的风景",
  description: "拍摄于2024年",
  year: 2024,
  width: 1920,
  height: 1080,
  exif: '{"camera": "Sony A7IV", ...}',
  created_at: "2024-01-15T10:30:00Z",
  updated_at: "2024-01-15T10:30:00Z"
}
```

### photo_tags 表保存的内容

```sql
{
  photo_id: "photo-123",
  tag_id: 1  -- 关联到 tags 表
}
```

## 🔑 关键点说明

### 1. OSS URL 保存
- ✅ **完全保存**：OSS 的完整 URL 保存在 `photos.url` 字段
- ✅ **缩略图 URL**：如果有缩略图，保存在 `photos.thumbnail_url` 字段
- ✅ **路径信息**：可以从 URL 中提取路径信息（如果需要）

### 2. 元数据保存
- ✅ **所有元数据**：标题、年份、尺寸、EXIF 等都保存
- ✅ **标签关联**：通过 `photo_tags` 表保存标签关系
- ✅ **时间戳**：创建时间、更新时间都记录

### 3. 数据查询
- ✅ **正常查询**：通过数据库查询照片列表
- ✅ **URL 访问**：前端直接使用数据库中的 OSS URL 显示图片
- ✅ **筛选功能**：年份、标签筛选完全基于数据库

## 📝 API 设计示例

### 1. 获取 STS 临时凭证

```typescript
// GET /api/oss/sts
Response: {
  success: true,
  data: {
    accessKeyId: "STS.xxx",
    accessKeySecret: "xxx",
    securityToken: "xxx",
    expiration: "2024-01-15T11:00:00Z",
    region: "oss-cn-hangzhou",
    bucket: "your-bucket"
  }
}
```

### 2. 保存照片元数据（OSS 模式）

```typescript
// POST /api/photos
Request: {
  url: "https://your-bucket.oss-cn-hangzhou.aliyuncs.com/photos/2024/xxx.jpg",
  thumbnail_url: "https://your-bucket.oss-cn-hangzhou.aliyuncs.com/thumbs/xxx.jpg",
  title: "美丽的风景",
  year: 2024,
  width: 1920,
  height: 1080,
  tags: ["Nature", "Landscape"],
  exif: {
    camera: "Sony A7IV",
    ...
  }
}

Response: {
  success: true,
  data: {
    id: "photo-123",
    url: "https://...",
    ... // 完整的照片信息
  }
}
```

### 3. 保存照片元数据（本地模式）

```typescript
// POST /api/photos
Request: {
  url: "/uploads/photos/2024/xxx.jpg",
  thumbnail_url: "/uploads/thumbs/xxx.jpg",
  title: "美丽的风景",
  year: 2024,
  width: 1920,
  height: 1080,
  tags: ["Nature", "Landscape"],
  exif: {...}
}

Response: {
  success: true,
  data: {
    id: "photo-123",
    url: "http://localhost:3001/uploads/photos/2024/xxx.jpg",
    ... // 完整的照片信息
  }
}
```

## 🔄 前端代码示例

### OSS 模式上传流程

```typescript
// 1. 获取 STS 临时凭证
const stsResponse = await fetch('/api/oss/sts');
const { accessKeyId, accessKeySecret, securityToken, bucket, region } = stsResponse.data;

// 2. 初始化 OSS 客户端（前端）
import OSS from 'ali-oss';

const client = new OSS({
  region,
  accessKeyId,
  accessKeySecret,
  stsToken: securityToken,
  bucket
});

// 3. 上传文件到 OSS
const fileName = `photos/${year}/${Date.now()}-${file.name}`;
const result = await client.put(fileName, file);

// 4. 获取图片尺寸
const { width, height } = await getImageDimensions(file);

// 5. 生成缩略图（可选，需要后端支持或前端处理）
const thumbnailResult = await client.put(`thumbs/${fileName}`, thumbnailFile);

// 6. 保存元数据到数据库
const photo = await photoService.uploadPhoto(
  result.url,           // OSS URL
  thumbnailResult.url,  // 缩略图 URL
  {
    title: newTitle,
    year: newYear,
    tags: tags,
    width: width,
    height: height,
    exif: {...}
  }
);
```

## ⚠️ 注意事项

### 1. 缩略图处理
- **方案 1**：前端生成缩略图（使用 canvas）
- **方案 2**：后端生成（需要先上传原图到后端）
- **方案 3**：OSS 图片处理服务（阿里云 OSS 支持）

### 2. 图片尺寸获取
- 前端可以在上传前获取尺寸
- 使用 `Image` API 或 `canvas` API

### 3. EXIF 信息提取
- 前端可以使用 `exif-js` 库提取
- 或后端处理（需要先上传到后端）

### 4. 错误处理
- OSS 上传失败：需要清理已上传的文件
- 数据库保存失败：需要删除 OSS 文件（或标记为待清理）

## 📊 方案 B 的优势

1. ✅ **数据库完整保存**：所有元数据都保存在数据库
2. ✅ **上传速度快**：文件直接上传到 OSS，不经过后端
3. ✅ **减轻后端压力**：后端只处理元数据，不处理文件
4. ✅ **支持断点续传**：OSS SDK 支持大文件断点续传
5. ✅ **CDN 加速**：OSS 可以配置 CDN，访问速度快

## 🎯 总结

**方案 B 完全可以保存所有数据到数据库！**

- ✅ OSS URL 保存在 `photos.url`
- ✅ 缩略图 URL 保存在 `photos.thumbnail_url`
- ✅ 所有元数据（标题、年份、尺寸、EXIF）都保存
- ✅ 标签关联通过 `photo_tags` 表保存
- ✅ 查询、筛选功能完全基于数据库

**唯一区别**：文件存储位置不同
- 方案 A：文件在后端服务器或 OSS（后端上传）
- 方案 B：文件在 OSS（前端直传），但元数据都在数据库

