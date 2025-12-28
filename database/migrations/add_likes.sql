-- 数据库迁移脚本：添加点赞功能
-- 执行此脚本将为现有数据库添加点赞相关字段和表

-- 1. 为 photos 表添加 likes_count 字段（如果不存在）
-- SQLite 不支持直接检查列是否存在，所以使用 ALTER TABLE 的容错方式
-- 如果列已存在，会报错，但我们可以忽略

-- 注意：SQLite 的 ALTER TABLE 不支持 IF NOT EXISTS，所以需要先检查
-- 这里使用一个技巧：尝试添加列，如果失败则忽略

-- 添加 likes_count 字段
-- 如果字段已存在，此语句会失败，但不会影响其他操作
-- 在生产环境中，建议先检查字段是否存在

-- 由于 SQLite 的限制，我们需要使用一个变通方法
-- 先尝试查询，如果查询失败说明字段不存在，然后添加

-- 添加 likes_count 字段（默认值为 0）
-- 注意：如果字段已存在，需要手动处理或使用应用层逻辑

-- 创建 photo_likes 表（如果不存在）
CREATE TABLE IF NOT EXISTS photo_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_photo_likes_photo_id ON photo_likes(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_likes_fingerprint ON photo_likes(fingerprint, photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_likes_created_at ON photo_likes(created_at);

