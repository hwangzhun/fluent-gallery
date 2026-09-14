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
- `GET /api/photos/page` - 首页游标分页（推荐）
  - Query params: `?limit=50&cursor=...&year=2024&tag=Nature`
  - `limit` 范围为 1–100；响应包含 `items`、`total`、`hasMore` 和 `nextCursor`
  - 下一次请求原样传回 `nextCursor`，筛选条件必须保持不变
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

### AI 照片信息 API

- `POST /api/ai/metadata` - 管理员上传单张照片，生成 `{ title, tags }`；标题为 15 字以内的中文标题，标签优先复用已有标签。
- `POST /api/ai/metadata/photo` - 管理员提交 `{ photoId }`，为已存照片生成标题与标签。
- `POST /api/ai/title` - 管理员上传单张照片，只生成 `{ title }`。
- `POST /api/ai/title/photo` - 管理员提交 `{ photoId }`，只为已存照片生成标题。
- 原有 `POST /api/ai/tags` 和 `POST /api/ai/tags/photo` 保留兼容。

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


## 画册 API

- `GET /api/albums`：已发布且非空的画册摘要，含 `photoCount`、实际封面 `coverPhotoId` 和最多三张 `previews`。
- `GET /api/albums/:id`：画册及按编排顺序排列的 `photos`；草稿或空画册返回 404。
- `GET /api/albums/admin`、`GET /api/albums/admin/:id`：管理员读取全部画册与编排。
- `POST /api/albums`、`PUT /api/albums/:id`：保存 `{ name, description, published, coverPhotoId, photoIds }`。`photoIds` 为有序、不重复的照片 ID；`coverPhotoId: null` 自动以首张作封面，指定封面必须是成员。空画册不能首次发布；已发布画册清空后保留发布状态，但前台自动隐藏。
- `PUT /api/albums/order`：提交 `{ ids }`，完整指定画册顺序。
- `POST /api/albums/members`：提交 `{ albumIds, photoIds }`，按传入顺序追加，自动跳过已有成员。
- `DELETE /api/albums/:id`：仅删除画册及关联。

所有管理接口要求现有管理员会话。成功响应沿用 `{ success: true, data }`，无返回数据的操作省略 `data`。

`GET /api/photos/admin` 新增 `albumId` 筛选，并为照片返回 `albums: [{ id, name }]`。照片创建、更新以及上传 metadata 接受可选 `albumIds`：省略时保留旧行为，更新时传 `[]` 解除全部关联。上传 metadata 另支持可选 `albumBeforePhotoIds`（批量重试时后续已成功照片的 ID），将重试成员插入对应画册的后续成员之前；无匹配成员时追加。照片、标签及画册关联在同一事务内提交；失败会回滚，并清理本次已写入的图片。
