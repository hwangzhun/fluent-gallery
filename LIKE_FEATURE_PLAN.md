# 点赞功能实现方案

## 需求分析
- ✅ 无需登录即可点赞
- ✅ 防止恶意刷赞（防止疯狂点击导致数据失实）

## 防刷策略

### 1. 多层防护机制

#### 第一层：前端防抖 + LocalStorage
- 使用 LocalStorage 记录用户已点赞的照片ID
- 前端按钮点击后立即禁用，防止重复点击
- 即使刷新页面，也能记住已点赞状态

#### 第二层：IP地址 + 时间窗口限制
- 后端记录每个点赞的 IP 地址
- 同一 IP 对同一照片在 **24小时** 内只能点赞一次
- 这是核心防刷机制

#### 第三层：请求频率限制（可选增强）
- 同一 IP 在短时间内（如1分钟）最多只能点赞 N 次（如10次）
- 防止短时间内对多个照片刷赞

## 数据库设计

### 1. 修改 photos 表
```sql
-- 添加点赞数字段
ALTER TABLE photos ADD COLUMN likes_count INTEGER NOT NULL DEFAULT 0;
```

### 2. 创建 photo_likes 表（记录点赞历史）
```sql
CREATE TABLE IF NOT EXISTS photo_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_id TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
);

-- 索引：优化查询性能
CREATE INDEX IF NOT EXISTS idx_photo_likes_photo_id ON photo_likes(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_likes_ip_photo ON photo_likes(ip_address, photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_likes_created_at ON photo_likes(created_at);
```

## API 设计

### POST /api/photos/:id/like
点赞接口

**请求**：
- 无需认证
- 自动从请求头获取 IP 地址

**响应**：
```json
{
  "success": true,
  "data": {
    "liked": true,
    "likesCount": 123
  },
  "message": "点赞成功"
}
```

**错误响应**：
```json
{
  "success": false,
  "error": "您已经点过赞了，24小时后可以再次点赞",
  "code": "ALREADY_LIKED"
}
```

### GET /api/photos/:id/like-status
检查点赞状态（可选，用于前端初始化）

**响应**：
```json
{
  "success": true,
  "data": {
    "liked": false,
    "likesCount": 123,
    "canLike": true  // 是否可以点赞（基于IP和时间窗口）
  }
}
```

## 前端实现

### 1. 类型定义更新
在 `types.ts` 中添加：
```typescript
export interface Photo {
  // ... 现有字段
  likesCount?: number;  // 点赞数
  isLiked?: boolean;    // 是否已点赞（前端状态）
}
```

### 2. 点赞服务
创建 `services/likeService.ts`：
- `likePhoto(photoId: string)` - 点赞
- `checkLikeStatus(photoId: string)` - 检查状态（可选）
- 使用 LocalStorage 缓存已点赞状态

### 3. 组件更新
- `PhotoCard.tsx` - 显示点赞数，添加点赞按钮
- `Lightbox.tsx` - 在详情页也显示点赞功能

## 实现细节

### IP 地址获取
在 Express 中：
```typescript
const getClientIp = (req: express.Request): string => {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    'unknown'
  );
};
```

### 时间窗口检查
```typescript
// 检查24小时内是否已点赞
const hasLikedRecently = await checkLikeInTimeWindow(photoId, ipAddress, 24 * 60 * 60 * 1000);
```

### LocalStorage 键名
```typescript
const LIKED_PHOTOS_KEY = 'fluent_gallery_liked_photos';
// 存储格式：{ [photoId]: timestamp }
```

## 安全考虑

### 优点
1. ✅ 无需登录，用户体验好
2. ✅ IP限制可以有效防止大部分刷赞行为
3. ✅ 时间窗口限制防止重复点赞
4. ✅ 前端缓存提升用户体验

### 局限性
1. ⚠️ 同一局域网用户共享IP，可能互相影响
2. ⚠️ 使用VPN或代理可以绕过IP限制
3. ⚠️ 清除浏览器数据可以清除LocalStorage缓存

### 可选增强方案
如果发现刷赞严重，可以考虑：
1. **浏览器指纹识别**：结合 User-Agent、屏幕分辨率等生成指纹
2. **验证码**：点赞前要求验证码（影响体验，不推荐）
3. **登录系统**：要求登录才能点赞（不符合当前需求）

## 实施步骤

1. ✅ 数据库迁移（添加字段和表）
2. ✅ 后端API实现（点赞接口）
3. ✅ 前端服务实现（likeService）
4. ✅ 组件更新（显示点赞数和按钮）
5. ✅ 测试验证

## 配置参数

可以在配置文件中设置：
- `LIKE_TIME_WINDOW`: 点赞时间窗口（默认24小时）
- `MAX_LIKES_PER_MINUTE`: 每分钟最多点赞数（可选，默认10）

