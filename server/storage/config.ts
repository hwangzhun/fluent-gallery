/**
 * 存储配置管理
 */

import { isAbsolute, resolve } from 'node:path';

export type StorageMode = 'local' | 'oss';

export interface LocalStorageConfig {
  uploadDir: string;
  publicUrl: string;
}

export type OSSProvider = 'aliyun' | 'tencent';

export interface OSSConfig {
  provider?: OSSProvider; // OSS 提供商：aliyun 或 tencent，默认为 aliyun
  uploadDir: string; // Bucket 内的统一路径前缀
  cloudImageProcessing: boolean;
  publicUrl: string;
  region: string;
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint?: string;
  // STS 配置（用于临时凭证）
  roleArn?: string; // RAM 角色 ARN（阿里云）或 CAM 角色（腾讯云）
  roleSessionName?: string; // 会话名称
}

export interface StorageConfig {
  mode: StorageMode;
  local?: LocalStorageConfig;
  oss?: OSSConfig;
}

export function getDefaultLocalStorageConfig(): LocalStorageConfig {
  return {
    uploadDir: process.env.LOCAL_UPLOAD_DIR || './uploads',
    publicUrl: process.env.LOCAL_PUBLIC_URL || '/uploads',
  };
}

export function resolveLocalUploadDir(uploadDir: string): string {
  return isAbsolute(uploadDir) ? uploadDir : resolve(process.cwd(), uploadDir);
}

function isLegacyLocalPublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.host === 'localhost:3001' || url.host === '127.0.0.1:3001') && url.pathname.replace(/\/+$/, '') === '/uploads';
  } catch {
    return false;
  }
}

/**
 * Rebase URLs written by pre-Docker local installs.  Those installs persisted
 * http://localhost:3001/uploads/... in SQLite, which points at each visitor's
 * machine once the gallery is served behind a public Docker deployment.
 */
export async function migrateLegacyLocalPhotoUrls(config: StorageConfig): Promise<number> {
  if (config.mode !== 'local' || !config.local?.publicUrl) return 0;

  const { dbAll, dbRun } = await import('../../database/db');
  const { deriveStorageKey } = await import('../../database/storageKey');
  const photos = await dbAll<{ id: string; url: string; thumbnail_url: string; object_key: string | null; thumbnail_object_key: string | null }>(
    `SELECT id, url, thumbnail_url, object_key, thumbnail_object_key FROM photos`,
  );
  const publicUrl = config.local.publicUrl.replace(/\/+$/, '');
  let migrated = 0;

  const isLegacyLocalUrl = (value: string) => {
    try {
      const url = new URL(value);
      return isLegacyLocalPublicUrl(`${url.origin}/uploads`) && url.pathname.startsWith('/uploads/');
    } catch {
      return false;
    }
  };
  const toCurrentPublicUrl = (value: string, objectKey: string | null) => {
    if (!isLegacyLocalUrl(value)) return value;
    const key = objectKey || deriveStorageKey(value);
    return key ? `${publicUrl}/${key.replace(/^\/+/, '')}` : value;
  };

  for (const photo of photos) {
    const url = toCurrentPublicUrl(photo.url, photo.object_key);
    const thumbnailUrl = toCurrentPublicUrl(photo.thumbnail_url, photo.thumbnail_object_key);
    if (url === photo.url && thumbnailUrl === photo.thumbnail_url) continue;
    await dbRun('UPDATE photos SET url = ?, thumbnail_url = ? WHERE id = ?', [url, thumbnailUrl, photo.id]);
    migrated += 1;
  }
  return migrated;
}

/**
 * 从环境变量加载配置
 */
export function loadStorageConfigFromEnv(): StorageConfig {
  const mode = (process.env.STORAGE_MODE || 'local') as StorageMode;

  const config: StorageConfig = {
    mode
  };

  // 本地存储配置
  if (mode === 'local') {
    config.local = getDefaultLocalStorageConfig();
  }

  // OSS 配置
  if (mode === 'oss') {
    const ossConfig: OSSConfig = {
      provider: (process.env.OSS_PROVIDER as OSSProvider) || 'aliyun',
      uploadDir: process.env.OSS_UPLOAD_DIR || 'fluent_gallery',
      cloudImageProcessing: process.env.OSS_CLOUD_IMAGE_PROCESSING === 'true',
      publicUrl: process.env.OSS_PUBLIC_URL || '',
      region: process.env.OSS_REGION || '',
      accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
      bucket: process.env.OSS_BUCKET || '',
      endpoint: process.env.OSS_ENDPOINT,
      roleArn: process.env.OSS_ROLE_ARN,
      roleSessionName: process.env.OSS_ROLE_SESSION_NAME || 'fluent-gallery-session'
    };

    // 验证必填字段
    if (!ossConfig.region || !ossConfig.accessKeyId || !ossConfig.accessKeySecret || !ossConfig.bucket) {
      throw new Error('OSS 配置不完整，请检查环境变量：OSS_REGION, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET');
    }

    config.oss = ossConfig;
  }

  return config;
}

/**
 * 从数据库加载配置（如果存在）
 */
export async function loadStorageConfigFromDB(): Promise<StorageConfig | null> {
  try {
    const { getDatabase } = await import('../../database/db');
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      // 确保 settings 表存在
      db.run(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // 从数据库读取保存的配置
        db.get("SELECT value FROM settings WHERE key = 'storage_config'", (err, row: any) => {
          if (err) {
            reject(err);
            return;
          }

          if (!row || !row.value) {
            resolve(null);
            return;
          }

          try {
            const savedConfig = JSON.parse(row.value);
            const config: StorageConfig = {
              mode: savedConfig.mode || 'local'
            };

            if (savedConfig.local) {
              config.local = {
                ...savedConfig.local,
                // The old default only works for a browser running on the API host.
                // Re-evaluate it from the current environment for Docker deployments.
                publicUrl: isLegacyLocalPublicUrl(savedConfig.local.publicUrl)
                  ? getDefaultLocalStorageConfig().publicUrl
                  : savedConfig.local.publicUrl,
              };
            }

            if (savedConfig.oss) {
              config.oss = {
                ...savedConfig.oss,
                uploadDir: savedConfig.oss.uploadDir || 'fluent_gallery',
                cloudImageProcessing: savedConfig.oss.cloudImageProcessing === true,
                publicUrl: savedConfig.oss.publicUrl || '',
              };
            }

            resolve(config);
          } catch (e) {
            console.error('解析数据库配置失败:', e);
            resolve(null);
          }
        });
      });
    });
  } catch (error) {
    console.error('从数据库加载配置失败:', error);
    return null;
  }
}

/**
 * 加载配置（优先从数据库，回退到环境变量）
 */
export async function loadStorageConfig(): Promise<StorageConfig> {
  // 先尝试从数据库加载
  const dbConfig = await loadStorageConfigFromDB();
  if (dbConfig) {
    console.log('✅ 从数据库加载存储配置:', dbConfig.mode);
    return dbConfig;
  }

  // 如果数据库中没有配置，使用环境变量
  console.log('📝 使用环境变量配置');
  return loadStorageConfigFromEnv();
}

/**
 * 同步加载配置（用于模块初始化，仅从环境变量）
 */
export function loadStorageConfigSync(): StorageConfig {
  return loadStorageConfigFromEnv();
}

// 导出配置实例（初始值，会在服务器启动时更新）
export let storageConfig: StorageConfig = loadStorageConfigSync();

/**
 * 更新存储配置（在服务器启动时调用）
 */
export async function refreshStorageConfig(): Promise<void> {
  try {
    storageConfig = await loadStorageConfig();
    console.log('✅ 存储配置已刷新:', storageConfig.mode);
  } catch (error) {
    console.error('❌ 刷新存储配置失败:', error);
  }
}
