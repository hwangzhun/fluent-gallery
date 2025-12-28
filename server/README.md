# 后端 API 服务器

## 启动服务器

```bash
# 开发模式（自动重启）
npm run dev:server

# 或者使用 tsx 直接运行
tsx server/index.ts
```

服务器默认运行在 `http://localhost:3001`

## API 端点

### 健康检查
- `GET /health` - 检查服务器状态

### 照片 API
- `GET /api/photos` - 获取所有照片（支持筛选）
  - Query params: `?year=2024&tag=Nature`
- `GET /api/photos/:id` - 获取照片详情
- `POST /api/photos` - 创建新照片
- `PUT /api/photos/:id` - 更新照片
- `DELETE /api/photos/:id` - 删除照片

### 标签 API
- `GET /api/tags` - 获取所有标签
- `GET /api/tags/names` - 获取所有标签名称
- `GET /api/tags/:id` - 获取标签详情
- `POST /api/tags` - 创建新标签
- `DELETE /api/tags/:id` - 删除标签

## 数据库

数据库文件存储在 `data/gallery.db`（自动创建）

首次启动时会自动初始化数据库表结构。

## 响应格式

所有 API 响应都遵循统一格式：

```json
{
  "success": true,
  "data": {...},
  "message": "操作成功"
}
```

错误响应：

```json
{
  "success": false,
  "error": "错误描述",
  "message": "详细错误信息（开发环境）"
}
```

