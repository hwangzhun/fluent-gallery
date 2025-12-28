// 数据库迁移脚本：为 photos 表添加 likes_count 字段
// 由于 SQLite 不支持 ALTER TABLE ADD COLUMN IF NOT EXISTS
// 需要使用 JavaScript 来检查并添加字段

import sqlite3 from 'sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '../../data/gallery.db');

async function addLikesColumn() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ 无法打开数据库:', err);
        reject(err);
        return;
      }
    });

    // 检查 likes_count 列是否存在
    db.all("PRAGMA table_info(photos)", (err, rows) => {
      if (err) {
        console.error('❌ 查询表结构失败:', err);
        db.close();
        reject(err);
        return;
      }

      const hasLikesCount = rows.some(row => row.name === 'likes_count');

      if (hasLikesCount) {
        console.log('✅ likes_count 字段已存在，跳过添加');
        db.close();
        resolve();
        return;
      }

      // 添加 likes_count 字段
      db.run(
        'ALTER TABLE photos ADD COLUMN likes_count INTEGER NOT NULL DEFAULT 0',
        (err) => {
          if (err) {
            console.error('❌ 添加 likes_count 字段失败:', err);
            db.close();
            reject(err);
            return;
          }

          console.log('✅ 成功添加 likes_count 字段');
          
          // 更新现有照片的 likes_count（基于 photo_likes 表）
          db.run(
            `UPDATE photos 
             SET likes_count = (
               SELECT COUNT(*) 
               FROM photo_likes 
               WHERE photo_likes.photo_id = photos.id
             )`,
            (err) => {
              if (err) {
                console.warn('⚠️  更新现有照片点赞数失败:', err);
              } else {
                console.log('✅ 已更新现有照片的点赞数');
              }
              db.close();
              resolve();
            }
          );
        }
      );
    });
  });
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  addLikesColumn()
    .then(() => {
      console.log('✅ 迁移完成');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ 迁移失败:', err);
      process.exit(1);
    });
}

export { addLikesColumn };

