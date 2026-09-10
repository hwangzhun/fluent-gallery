import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import { readFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 数据库文件路径
const DB_PATH = process.env.GALLERY_DB_PATH || join(__dirname, '../data/gallery.db');
const DB_DIR = dirname(DB_PATH);

// 确保数据目录存在
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
  console.log('📁 创建数据目录:', DB_DIR);
}

// 数据库连接实例
let db: Database | null = null;

/**
 * 获取数据库连接（单例模式）
 */
export function getDatabase(): Database {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ 数据库连接失败:', err.message);
        throw err;
      }
      console.log('✅ 已连接到 SQLite 数据库:', DB_PATH);
    });

    // 启用外键约束
    db.run('PRAGMA foreign_keys = ON');
  }
  return db;
}

/**
 * 检查数据库表是否存在
 */
async function checkTablesExist(): Promise<boolean> {
  const db = getDatabase();
  return new Promise((resolve) => {
    db.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('photos', 'tags', 'photo_tags', 'photo_likes')",
      (err, rows: any[]) => {
        if (err) {
          resolve(false);
          return;
        }
        resolve(rows.length >= 3); // 至少要有基础表
      }
    );
  });
}

/**
 * 检查 photos 表是否有指定字段
 */
async function checkColumnExists(columnName: string): Promise<boolean> {
  const db = getDatabase();
  return new Promise((resolve) => {
    db.all("PRAGMA table_info(photos)", (err, rows: any[]) => {
      if (err) {
        resolve(false);
        return;
      }
      const exists = rows.some((row: any) => row.name === columnName);
      resolve(exists);
    });
  });
}

/**
 * 添加字段到 photos 表
 */
async function addColumnToPhotos(columnName: string, columnDef: string): Promise<void> {
  const db = getDatabase();
  return new Promise((resolve, reject) => {
    db.run(
      `ALTER TABLE photos ADD COLUMN ${columnName} ${columnDef}`,
      (err) => {
        if (err) {
          // 如果字段已存在，忽略错误
          if (err.message.includes('duplicate column')) {
            console.log(`✅ ${columnName} 字段已存在`);
            resolve();
            return;
          }
          reject(err);
          return;
        }
        console.log(`✅ 已添加 ${columnName} 字段`);
        resolve();
      }
    );
  });
}

/**
 * 初始化数据库（创建表结构）
 */
export async function initDatabase(): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      // 如果数据库文件已存在，先检查表是否完整
      if (existsSync(DB_PATH)) {
        const db = getDatabase();
        const tablesExist = await checkTablesExist();
        
        if (tablesExist) {
          console.log('✅ 数据库表已存在');
          
          // 检查是否需要添加 likes_count 字段（迁移）
          const hasLikesCount = await checkColumnExists('likes_count');
          if (!hasLikesCount) {
            console.log('📝 检测到需要迁移：添加 likes_count 字段');
            await addColumnToPhotos('likes_count', 'INTEGER NOT NULL DEFAULT 0');
          }
          
          // 检查是否需要添加 views_count 字段（迁移）
          const hasViewsCount = await checkColumnExists('views_count');
          if (!hasViewsCount) {
            console.log('📝 检测到需要迁移：添加 views_count 字段');
            await addColumnToPhotos('views_count', 'INTEGER NOT NULL DEFAULT 0');
          }

          await dbRun('CREATE INDEX IF NOT EXISTS idx_photos_likes_count ON photos(likes_count)');
          await dbRun('CREATE INDEX IF NOT EXISTS idx_photos_views_count ON photos(views_count)');
          
          // 确保 photo_likes 表存在
          const photoLikesExists = await new Promise<boolean>((resolve) => {
            db.all(
              "SELECT name FROM sqlite_master WHERE type='table' AND name='photo_likes'",
              (err, rows: any[]) => {
                if (err) {
                  resolve(false);
                  return;
                }
                resolve(rows.length > 0);
              }
            );
          });
          
          if (!photoLikesExists) {
            console.log('📝 创建 photo_likes 表');
            const photoLikesSchema = `
              CREATE TABLE IF NOT EXISTS photo_likes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                photo_id TEXT NOT NULL,
                fingerprint TEXT NOT NULL,
                ip_address TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
              );
              CREATE INDEX IF NOT EXISTS idx_photo_likes_photo_id ON photo_likes(photo_id);
              CREATE INDEX IF NOT EXISTS idx_photo_likes_fingerprint ON photo_likes(fingerprint, photo_id);
              CREATE INDEX IF NOT EXISTS idx_photo_likes_created_at ON photo_likes(created_at);
            `;
            await new Promise<void>((resolve, reject) => {
              db.exec(photoLikesSchema, (err) => {
                if (err) {
                  reject(err);
                  return;
                }
                console.log('✅ photo_likes 表创建完成');
                resolve();
              });
            });
          }
          
          // 确保 photo_views 表存在
          const photoViewsExists = await new Promise<boolean>((resolve) => {
            db.all(
              "SELECT name FROM sqlite_master WHERE type='table' AND name='photo_views'",
              (err, rows: any[]) => {
                if (err) {
                  resolve(false);
                  return;
                }
                resolve(rows.length > 0);
              }
            );
          });
          
          if (!photoViewsExists) {
            console.log('📝 创建 photo_views 表');
            const photoViewsSchema = `
              CREATE TABLE IF NOT EXISTS photo_views (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                photo_id TEXT NOT NULL,
                fingerprint TEXT NOT NULL,
                ip_address TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
              );
              CREATE INDEX IF NOT EXISTS idx_photo_views_photo_id ON photo_views(photo_id);
              CREATE INDEX IF NOT EXISTS idx_photo_views_fingerprint ON photo_views(fingerprint, photo_id);
              CREATE INDEX IF NOT EXISTS idx_photo_views_created_at ON photo_views(created_at);
            `;
            await new Promise<void>((resolve, reject) => {
              db.exec(photoViewsSchema, (err) => {
                if (err) {
                  reject(err);
                  return;
                }
                console.log('✅ photo_views 表创建完成');
                resolve();
              });
            });
          }
          
          resolve();
          return;
        } else {
          // 数据库文件存在但表不完整，关闭连接并删除文件
          console.log('⚠️  检测到不完整的数据库，正在重置...');
          await closeDatabase();
          unlinkSync(DB_PATH);
          console.log('🗑️  已删除旧的数据库文件');
        }
      }

      // 重新获取数据库连接（会创建新文件）
      const db = getDatabase();

      // 读取 schema.sql 文件
      const schemaPath = join(__dirname, 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf-8');
      
      // 改进的 SQL 语句分割逻辑
      // 1. 移除单行注释（以 -- 开头的行）
      // 2. 按分号分割，但保留多行语句
      const lines = schema.split('\n');
      let currentStatement = '';
      const statements: string[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // 跳过空行和注释行
        if (trimmedLine.length === 0 || trimmedLine.startsWith('--')) {
          continue;
        }
        
        // 移除行内注释（-- 后面的内容）
        const lineWithoutComment = trimmedLine.split('--')[0].trim();
        if (lineWithoutComment.length === 0) {
          continue;
        }
        
        currentStatement += (currentStatement ? ' ' : '') + lineWithoutComment;
        
        // 如果行以分号结尾，说明语句结束
        if (lineWithoutComment.endsWith(';')) {
          const statement = currentStatement.slice(0, -1).trim(); // 移除末尾的分号
          if (statement.length > 0) {
            statements.push(statement);
          }
          currentStatement = '';
        }
      }
      
      // 处理最后一条可能没有分号的语句
      if (currentStatement.trim().length > 0) {
        statements.push(currentStatement.trim());
      }

      if (statements.length === 0) {
        console.log('✅ 数据库已初始化');
        resolve();
        return;
      }

      console.log(`📝 准备执行 ${statements.length} 条 SQL 语句`);

      // 顺序执行 SQL 语句（一个接一个）
      let currentIndex = 0;

      const executeNext = () => {
        if (currentIndex >= statements.length) {
          console.log('✅ 数据库表结构创建完成');
          resolve();
          return;
        }

        const statement = statements[currentIndex];
        // 调试：显示正在执行的语句（前50个字符）
        const preview = statement.substring(0, 50).replace(/\s+/g, ' ');
        console.log(`📌 执行语句 ${currentIndex + 1}/${statements.length}: ${preview}...`);
        
        db.run(statement, (err) => {
          if (err) {
            console.error(`❌ 执行 SQL 语句失败 (${currentIndex + 1}/${statements.length}):`, err.message);
            console.error('失败的 SQL:', statement.substring(0, 200));
            reject(err);
            return;
          }
          
          currentIndex++;
          executeNext(); // 执行下一条语句
        });
      };

      // 开始执行第一条语句
      executeNext();
    } catch (error) {
      console.error('❌ 初始化数据库失败:', error);
      reject(error);
    }
  });
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve();
      return;
    }

    db.close((err) => {
      if (err) {
        console.error('❌ 关闭数据库连接失败:', err.message);
        reject(err);
        return;
      }
      console.log('✅ 数据库连接已关闭');
      db = null;
      resolve();
    });
  });
}

/**
 * 执行 SQL 查询（返回 Promise）
 */
export function dbRun(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    database.run(sql, params, function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/**
 * 执行 SQL 查询（返回单行）
 */
export function dbGet<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    database.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row as T);
    });
  });
}

/**
 * 执行 SQL 查询（返回多行）
 */
export function dbAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const database = getDatabase();
  return new Promise((resolve, reject) => {
    database.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows as T[]);
    });
  });
}
