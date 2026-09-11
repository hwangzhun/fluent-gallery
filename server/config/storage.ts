/**
 * 存储配置管理
 */

export type StorageMode = 'local' | 'oss';

export interface LocalStorageConfig {
  uploadDir: string;
  publicUrl: string;
}

export interface OSSConfig {
  uploadDir: string;
  cloudImageProcessing: boolean;
  publicUrl: string;
  region: string;
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint?: string;
  // STS 配置（用于临时凭证）
  roleArn?: string; // RAM 角色 ARN
  roleSessionName?: string; // 会话名称
  durationSeconds?: number; // 凭证有效期（秒）
}

export interface StorageConfig {
  mode: StorageMode;
  local?: LocalStorageConfig;
  oss?: OSSConfig;
}

/**
 * 从环境变量加载配置
 */
export function loadStorageConfig(): StorageConfig {
  const mode = (process.env.STORAGE_MODE || 'local') as StorageMode;

  const config: StorageConfig = {
    mode
  };

  // 本地存储配置
  if (mode === 'local') {
    config.local = {
      uploadDir: process.env.LOCAL_UPLOAD_DIR || './uploads',
      publicUrl: process.env.LOCAL_PUBLIC_URL || 'http://localhost:3001/uploads'
    };
  }

  // OSS 配置
  if (mode === 'oss') {
    const ossConfig: OSSConfig = {
      uploadDir: process.env.OSS_UPLOAD_DIR || 'fluent_gallery',
      cloudImageProcessing: process.env.OSS_CLOUD_IMAGE_PROCESSING === 'true',
      publicUrl: process.env.OSS_PUBLIC_URL || '',
      region: process.env.OSS_REGION || '',
      accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
      bucket: process.env.OSS_BUCKET || '',
      endpoint: process.env.OSS_ENDPOINT,
      roleArn: process.env.OSS_ROLE_ARN,
      roleSessionName: process.env.OSS_ROLE_SESSION_NAME || 'fluent-gallery-session',
      durationSeconds: parseInt(process.env.OSS_DURATION_SECONDS || '3600', 10)
    };

    // 验证必需配置
    if (!ossConfig.region || !ossConfig.accessKeyId || !ossConfig.accessKeySecret || !ossConfig.bucket) {
      throw new Error('OSS 配置不完整，请检查环境变量：OSS_REGION, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET');
    }

    config.oss = ossConfig;
  }

  return config;
}

/**
 * 获取当前存储配置
 */
export const storageConfig = loadStorageConfig();
