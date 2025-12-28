/**
 * 设置相关路由
 */
import express from 'express';
import { getDatabase } from '../../database/db';
import { loadStorageConfig } from '../storage/config';

const router = express.Router();

/**
 * GET /api/settings/admin
 * 获取管理员密码配置（仅返回是否已设置，不返回密码）
 */
router.get('/admin', async (req, res) => {
  try {
    const db = getDatabase();
    
    // 检查是否有admin_settings表
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_settings'", (err, row: any) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: '查询数据库失败',
          message: err.message
        });
      }

      if (!row) {
        // 表不存在，创建表
        db.run(`
          CREATE TABLE IF NOT EXISTS admin_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `, (err) => {
          if (err) {
            return res.status(500).json({
              success: false,
              error: '创建表失败',
              message: err.message
            });
          }

          // 插入默认密码
          db.run(
            "INSERT OR IGNORE INTO admin_settings (key, value) VALUES ('admin_password', 'admin123')",
            (err) => {
              if (err) {
                return res.status(500).json({
                  success: false,
                  error: '初始化密码失败',
                  message: err.message
                });
              }

              res.json({
                success: true,
                data: {
                  hasPassword: true
                }
              });
            }
          );
        });
      } else {
        // 表存在，检查是否有密码
        db.get("SELECT value FROM admin_settings WHERE key = 'admin_password'", (err, row: any) => {
          if (err) {
            return res.status(500).json({
              success: false,
              error: '查询密码失败',
              message: err.message
            });
          }

          res.json({
            success: true,
            data: {
              hasPassword: !!row
            }
          });
        });
      }
    });
  } catch (error: any) {
    console.error('获取管理员设置失败:', error);
    res.status(500).json({
      success: false,
      error: '获取管理员设置失败',
      message: error.message
    });
  }
});

/**
 * PUT /api/settings/admin/password
 * 更新管理员密码
 */
router.put('/admin/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: '新密码长度至少为6位'
      });
    }

    const db = getDatabase();
    
    // 确保表存在
    db.run(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `, (err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: '创建表失败',
          message: err.message
        });
      }

      // 验证当前密码
      db.get("SELECT value FROM admin_settings WHERE key = 'admin_password'", (err, row: any) => {
        if (err) {
          return res.status(500).json({
            success: false,
            error: '查询密码失败',
            message: err.message
          });
        }

        const storedPassword = row?.value || 'admin123'; // 默认密码

        if (currentPassword !== storedPassword) {
          return res.status(401).json({
            success: false,
            error: '当前密码错误'
          });
        }

        // 更新密码
        db.run(
          "INSERT OR REPLACE INTO admin_settings (key, value, updated_at) VALUES ('admin_password', ?, datetime('now'))",
          [newPassword],
          (err) => {
            if (err) {
              return res.status(500).json({
                success: false,
                error: '更新密码失败',
                message: err.message
              });
            }

            res.json({
              success: true,
              message: '密码更新成功'
            });
          }
        );
      });
    });
  } catch (error: any) {
    console.error('更新密码失败:', error);
    res.status(500).json({
      success: false,
      error: '更新密码失败',
      message: error.message
    });
  }
});

/**
 * GET /api/settings/storage
 * 获取存储配置（从环境变量和数据库读取）
 */
router.get('/storage', async (req, res) => {
  try {
    const db = getDatabase();
    
    // 确保settings表存在
    await new Promise<void>((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    // 从数据库读取保存的配置
    const row: any = await new Promise((resolve, reject) => {
      db.get("SELECT value FROM settings WHERE key = 'storage_config'", (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });

    // 从环境变量构建默认配置
    const defaultConfig = await loadStorageConfig();
    let config: any = {
      mode: defaultConfig.mode,
      local: defaultConfig.local ? {
        uploadDir: defaultConfig.local.uploadDir,
        publicUrl: defaultConfig.local.publicUrl
      } : {
        uploadDir: './uploads',
        publicUrl: 'http://localhost:3001/uploads'
      },
      oss: defaultConfig.oss ? {
        provider: defaultConfig.oss.provider || 'aliyun',
        region: defaultConfig.oss.region,
        accessKeyId: defaultConfig.oss.accessKeyId,
        accessKeySecret: defaultConfig.oss.accessKeySecret,
        bucket: defaultConfig.oss.bucket,
        endpoint: defaultConfig.oss.endpoint || '',
        roleArn: defaultConfig.oss.roleArn || '',
        roleSessionName: defaultConfig.oss.roleSessionName || 'fluent-gallery-session'
      } : {
        provider: 'aliyun',
        region: '',
        accessKeyId: '',
        accessKeySecret: '',
        bucket: '',
        endpoint: '',
        roleArn: '',
        roleSessionName: 'fluent-gallery-session'
      },
      server: {
        port: process.env.PORT || '3001'
      },
      frontend: {
        apiBaseUrl: process.env.VITE_API_BASE_URL || 'http://localhost:3001/api'
      }
    };

    // 如果数据库中有保存的配置，优先使用数据库配置
    if (row && row.value) {
      try {
        const savedConfig = JSON.parse(row.value);
        // 合并保存的配置
        if (savedConfig.mode) config.mode = savedConfig.mode;
        if (savedConfig.local) {
          config.local = { ...config.local, ...savedConfig.local };
        }
        if (savedConfig.oss) {
          config.oss = { ...config.oss, ...savedConfig.oss };
        }
        if (savedConfig.server) {
          config.server = { ...config.server, ...savedConfig.server };
        }
        if (savedConfig.frontend) {
          config.frontend = { ...config.frontend, ...savedConfig.frontend };
        }
      } catch (e) {
        console.error('解析保存的配置失败:', e);
      }
    }

    res.json({
      success: true,
      data: config
    });
  } catch (error: any) {
    console.error('获取存储配置失败:', error);
    res.status(500).json({
      success: false,
      error: '获取存储配置失败',
      message: error.message
    });
  }
});

/**
 * PUT /api/settings/storage
 * 更新存储配置（保存到数据库，需要重启服务器生效）
 */
router.put('/storage', async (req, res) => {
  try {
    const { mode, local, oss, server, frontend } = req.body;

    // 验证必填字段
    if (mode === 'oss' && oss) {
      const provider = oss.provider || 'aliyun';
      const regionLabel = provider === 'tencent' ? '地域' : '区域';
      const keyIdLabel = provider === 'tencent' ? 'SecretId' : 'AccessKeyId';
      const keySecretLabel = provider === 'tencent' ? 'SecretKey' : 'AccessKeySecret';
      
      if (!oss.region || !oss.accessKeyId || !oss.accessKeySecret || !oss.bucket) {
        return res.status(400).json({
          success: false,
          error: `OSS配置不完整，请填写：${regionLabel}、${keyIdLabel}、${keySecretLabel}、Bucket`
        });
      }
    }

    if (mode === 'local' && local) {
      if (!local.uploadDir || !local.publicUrl) {
        return res.status(400).json({
          success: false,
          error: '本地存储配置不完整，请填写：上传目录、公共URL'
        });
      }
    }

    const db = getDatabase();
    
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `, (err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: '创建表失败',
          message: err.message
        });
      }

      // 保存配置到数据库
      const configData = JSON.stringify({ 
        mode, 
        local, 
        oss,
        server,
        frontend
      });
      db.run(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('storage_config', ?, datetime('now'))",
        [configData],
        (err) => {
          if (err) {
            return res.status(500).json({
              success: false,
              error: '保存配置失败',
              message: err.message
            });
          }

          res.json({
            success: true,
            message: '配置已保存到数据库（需要重启服务器生效）',
            data: { mode, local, oss, server, frontend }
          });
        }
      );
    });
  } catch (error: any) {
    console.error('更新存储配置失败:', error);
    res.status(500).json({
      success: false,
      error: '更新存储配置失败',
      message: error.message
    });
  }
});

/**
 * GET /api/settings/gallery
 * 获取图库设置
 */
router.get('/gallery', async (req, res) => {
  try {
    const db = getDatabase();
    
    // 确保settings表存在
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `, (err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: '创建表失败',
          message: err.message
        });
      }

      // 从数据库读取设置
      db.get("SELECT value FROM settings WHERE key = 'gallery_randomize_photos'", (err, row: any) => {
        if (err) {
          return res.status(500).json({
            success: false,
            error: '查询设置失败',
            message: err.message
          });
        }

        // 默认值为 false（不乱序）
        const randomizePhotos = row?.value === 'true';

        res.json({
          success: true,
          data: {
            randomizePhotos
          }
        });
      });
    });
  } catch (error: any) {
    console.error('获取图库设置失败:', error);
    res.status(500).json({
      success: false,
      error: '获取图库设置失败',
      message: error.message
    });
  }
});

/**
 * PUT /api/settings/gallery
 * 更新图库设置
 */
router.put('/gallery', async (req, res) => {
  try {
    const { randomizePhotos } = req.body;

    if (typeof randomizePhotos !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'randomizePhotos 必须是布尔值'
      });
    }

    const db = getDatabase();
    
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `, (err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: '创建表失败',
          message: err.message
        });
      }

      // 保存设置到数据库
      db.run(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('gallery_randomize_photos', ?, datetime('now'))",
        [randomizePhotos ? 'true' : 'false'],
        (err) => {
          if (err) {
            return res.status(500).json({
              success: false,
              error: '保存设置失败',
              message: err.message
            });
          }

          res.json({
            success: true,
            message: '图库设置已更新',
            data: { randomizePhotos }
          });
        }
      );
    });
  } catch (error: any) {
    console.error('更新图库设置失败:', error);
    res.status(500).json({
      success: false,
      error: '更新图库设置失败',
      message: error.message
    });
  }
});

export default router;

