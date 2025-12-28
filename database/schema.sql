-- Fluent Gallery 数据库表结构设计
-- SQLite 数据库

-- ============================================
-- 1. photos 表 - 照片主表
-- ============================================
CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,                    -- 照片唯一标识（UUID 或自定义ID）
    url TEXT NOT NULL,                      -- OSS 原图 URL
    thumbnail_url TEXT NOT NULL,            -- OSS 缩略图 URL
    title TEXT NOT NULL,                    -- 照片标题
    description TEXT,                       -- 照片描述（可选）
    year INTEGER NOT NULL,                  -- 拍摄年份（用于筛选）
    width INTEGER NOT NULL,                 -- 图片宽度（像素）
    height INTEGER NOT NULL,                -- 图片高度（像素）
    exif TEXT,                              -- EXIF 信息（JSON 格式存储）
    created_at TEXT NOT NULL DEFAULT (datetime('now')),  -- 创建时间（ISO 8601 格式）
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))   -- 更新时间
);

-- 索引：优化查询性能
CREATE INDEX IF NOT EXISTS idx_photos_year ON photos(year);              -- 按年份筛选
CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at); -- 按创建时间排序
CREATE INDEX IF NOT EXISTS idx_photos_title ON photos(title);            -- 按标题搜索（可选）

-- ============================================
-- 2. tags 表 - 标签表
-- ============================================
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,              -- 标签名称（唯一）
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 索引：标签名称查询
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

-- ============================================
-- 3. photo_tags 表 - 照片标签关联表（多对多）
-- ============================================
CREATE TABLE IF NOT EXISTS photo_tags (
    photo_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (photo_id, tag_id),
    FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- 索引：优化标签查询
CREATE INDEX IF NOT EXISTS idx_photo_tags_photo_id ON photo_tags(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_tags_tag_id ON photo_tags(tag_id);

-- ============================================
-- 4. photo_likes 表 - 点赞记录表
-- ============================================
CREATE TABLE IF NOT EXISTS photo_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL,              -- 浏览器指纹（主要标识）
    ip_address TEXT,                        -- IP地址（辅助，可选）
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
);

-- 索引：优化查询性能
CREATE INDEX IF NOT EXISTS idx_photo_likes_photo_id ON photo_likes(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_likes_fingerprint ON photo_likes(fingerprint, photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_likes_created_at ON photo_likes(created_at);

-- ============================================
-- 5. photo_views 表 - 浏览量记录表
-- ============================================
CREATE TABLE IF NOT EXISTS photo_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL,              -- 浏览器指纹（主要标识）
    ip_address TEXT,                        -- IP地址（辅助，可选）
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
);

-- 索引：优化查询性能
CREATE INDEX IF NOT EXISTS idx_photo_views_photo_id ON photo_views(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_views_fingerprint ON photo_views(fingerprint, photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_views_created_at ON photo_views(created_at);

-- ============================================
-- 示例数据（可选，用于测试）
-- ============================================
-- 插入示例标签
-- INSERT OR IGNORE INTO tags (name) VALUES 
--     ('Nature'), ('Forest'), ('Landscape'), ('Water'), 
--     ('Sunset'), ('Ocean'), ('Urban'), ('Architecture'),
--     ('Portrait'), ('People'), ('Lifestyle'), ('Abstract');

