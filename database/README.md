# 数据库设计说明

## 表结构设计

### 1. photos 表（照片主表）

存储照片的基本信息和元数据。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | TEXT | 照片唯一标识 | PRIMARY KEY |
| url | TEXT | OSS 原图 URL | NOT NULL |
| thumbnail_url | TEXT | OSS 缩略图 URL | NOT NULL |
| title | TEXT | 照片标题 | NOT NULL |
| description | TEXT | 照片描述 | 可选 |
| year | INTEGER | 拍摄年份 | NOT NULL |
| width | INTEGER | 图片宽度（像素） | NOT NULL |
| height | INTEGER | 图片高度（像素） | NOT NULL |
| exif | TEXT | EXIF 信息（JSON 格式） | 可选 |
| created_at | TEXT | 创建时间（ISO 8601） | NOT NULL |
| updated_at | TEXT | 更新时间 | NOT NULL |

**索引：**
- `idx_photos_year` - 优化按年份筛选
- `idx_photos_created_at` - 优化按时间排序
- `idx_photos_title` - 优化标题搜索

### 2. tags 表（标签表）

存储所有可用的标签。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | INTEGER | 标签 ID | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | 标签名称 | NOT NULL UNIQUE |
| created_at | TEXT | 创建时间 | NOT NULL |

**索引：**
- `idx_tags_name` - 优化标签名称查询

### 3. photo_tags 表（照片标签关联表）

实现照片和标签的多对多关系。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| photo_id | TEXT | 照片 ID | PRIMARY KEY, FOREIGN KEY |
| tag_id | INTEGER | 标签 ID | PRIMARY KEY, FOREIGN KEY |

**索引：**
- `idx_photo_tags_photo_id` - 优化通过照片查询标签
- `idx_photo_tags_tag_id` - 优化通过标签查询照片

## 设计考虑

### 为什么使用多对多关系？

1. **数据规范化**：避免在 photos 表中存储重复的标签数据
2. **查询灵活性**：可以轻松查询"包含某个标签的所有照片"
3. **扩展性**：未来可以添加标签统计、标签管理等功能
4. **数据一致性**：标签名称统一管理，避免拼写错误

### EXIF 数据存储

EXIF 信息以 JSON 格式存储在 `exif` 字段中，例如：
```json
{
  "camera": "Sony A7IV",
  "lens": "24-70mm GM",
  "aperture": "f/2.8",
  "shutterSpeed": "1/200",
  "iso": "100"
}
```

### 时间字段

使用 TEXT 类型存储 ISO 8601 格式的时间字符串（如 `2024-01-15T10:30:00Z`），便于：
- 跨平台兼容性
- 前端直接使用
- 避免时区问题

## 常用查询示例

### 查询所有照片（带标签）
```sql
SELECT 
    p.*,
    GROUP_CONCAT(t.name) as tags
FROM photos p
LEFT JOIN photo_tags pt ON p.id = pt.photo_id
LEFT JOIN tags t ON pt.tag_id = t.id
GROUP BY p.id
ORDER BY p.created_at DESC;
```

### 按年份筛选
```sql
SELECT * FROM photos WHERE year = 2024 ORDER BY created_at DESC;
```

### 按标签筛选
```sql
SELECT DISTINCT p.*
FROM photos p
INNER JOIN photo_tags pt ON p.id = pt.photo_id
INNER JOIN tags t ON pt.tag_id = t.id
WHERE t.name = 'Nature'
ORDER BY p.created_at DESC;
```

### 按年份和标签筛选
```sql
SELECT DISTINCT p.*
FROM photos p
INNER JOIN photo_tags pt ON p.id = pt.photo_id
INNER JOIN tags t ON pt.tag_id = t.id
WHERE p.year = 2024 AND t.name = 'Nature'
ORDER BY p.created_at DESC;
```

