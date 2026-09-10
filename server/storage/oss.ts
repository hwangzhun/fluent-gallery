/**
 * OSS 存储工具类（支持阿里云 OSS 和腾讯云 COS）
 */
import OSS from 'ali-oss';
import COS from 'cos-nodejs-sdk-v5';
import { loadStorageConfig, OSSProvider } from './config';

// 统一的客户端类型
type OSSClient = OSS | COS;

/**
 * 获取 OSS 客户端（根据配置选择阿里云或腾讯云）
 */
export async function getOSSClient(): Promise<OSSClient> {
  const config = await loadStorageConfig();
  
  if (!config.oss) {
    throw new Error('OSS 配置不存在');
  }

  const { provider = 'aliyun', region, accessKeyId, accessKeySecret, bucket, endpoint } = config.oss;

  console.log('🔧 OSS 客户端配置:', {
    provider,
    region,
    bucket,
    endpoint,
    accessKeyId: accessKeyId ? '***' + accessKeyId.slice(-4) : '未设置'
  });

  if (provider === 'tencent') {
    // 腾讯云 COS
    return new COS({
      SecretId: accessKeyId,
      SecretKey: accessKeySecret,
      // 如果提供了 endpoint，使用自定义 endpoint
      // 否则 SDK 会根据 region 自动构建
    } as any);
  } else {
    // 阿里云 OSS（默认）
    const ossConfig: any = {
      accessKeyId,
      accessKeySecret,
      bucket
    };

    // 如果提供了 endpoint，使用 endpoint
    if (endpoint) {
      ossConfig.endpoint = endpoint;
      // 如果 endpoint 是完整 URL，提取 hostname
      try {
        const url = new URL(endpoint);
        ossConfig.endpoint = url.hostname;
      } catch {
        // 如果不是 URL，直接使用
      }
    } else if (region) {
      ossConfig.region = region;
    } else {
      throw new Error('OSS 配置不完整：必须提供 region 或 endpoint');
    }

    return new OSS(ossConfig);
  }
}

/**
 * 获取 STS 临时凭证
 */
export async function getSTSCredentials(): Promise<{
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  expiration: string;
  region: string;
  bucket: string;
  provider?: OSSProvider;
}> {
  const config = await loadStorageConfig();
  
  if (!config.oss) {
    throw new Error('OSS 配置不存在');
  }

  const { provider = 'aliyun', region, accessKeyId, accessKeySecret, bucket, roleArn, roleSessionName } = config.oss;

  // 当前简化实现：直接返回主账号密钥
  // 生产环境应该配置 STS/CAM 临时凭证
  if (!roleArn) {
    console.warn('⚠️  未配置临时凭证，使用主账号密钥（仅用于开发测试，生产环境请配置 STS/CAM）');
    return {
      accessKeyId,
      accessKeySecret,
      securityToken: '',
      expiration: new Date(Date.now() + 3600 * 1000).toISOString(), // 1小时后过期
      region,
      bucket,
      provider
    };
  }

  // TODO: 集成 STS/CAM 临时凭证服务
  // 阿里云：使用 STS SDK
  // 腾讯云：使用 CAM SDK
  console.warn('STS/CAM 功能需要配置，当前使用主账号密钥（仅开发测试）');
  return {
    accessKeyId,
    accessKeySecret,
    securityToken: '',
    expiration: new Date(Date.now() + 3600 * 1000).toISOString(),
    region,
    bucket,
    provider
  };
}

/**
 * 生成文件路径
 */
export function generateFilePath(filename: string, prefix: string = 'photos'): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  // 提取文件扩展名
  const ext = filename.split('.').pop() || 'jpg';
  
  // 生成唯一文件名
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  const uniqueFilename = `${timestamp}-${random}.${ext}`;
  
  return `${prefix}/${year}/${month}/${day}/${uniqueFilename}`;
}

/**
 * 从 OSS URL 提取文件路径
 */
export function extractPathFromOSSUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    // 移除开头的 /
    return urlObj.pathname.substring(1);
  } catch {
    return null;
  }
}

/**
 * 上传文件到 OSS/COS
 */
export async function putOSSFile(
  client: OSSClient,
  path: string,
  buffer: Buffer,
  options?: { mime?: string }
): Promise<{ url: string }> {
  const config = await loadStorageConfig();
  const provider = config.oss?.provider || 'aliyun';

  if (provider === 'tencent') {
    // 腾讯云 COS
    const cosClient = client as COS;
    const bucket = config.oss!.bucket;
    const region = config.oss!.region;

    return new Promise((resolve, reject) => {
      cosClient.putObject(
        {
          Bucket: bucket,
          Region: region,
          Key: path,
          Body: buffer,
          ContentType: options?.mime || 'image/jpeg'
        },
        (err: any, data: any) => {
          if (err) {
            reject(err);
            return;
          }
          // 构建文件 URL
          const url = `https://${bucket}.cos.${region}.myqcloud.com/${path}`;
          resolve({ url });
        }
      );
    });
  } else {
    // 阿里云 OSS
    const ossClient = client as OSS;
    const result = await ossClient.put(path, buffer, {
      mime: options?.mime
    });
    return { url: result.url };
  }
}

/**
 * 删除 OSS 文件
 */
export async function deleteOSSFile(path: string): Promise<void> {
  try {
    const client = await getOSSClient();
    const config = await loadStorageConfig();
    const provider = config.oss?.provider || 'aliyun';

    if (provider === 'tencent') {
      // 腾讯云 COS
      const cosClient = client as COS;
      const bucket = config.oss!.bucket;
      const region = config.oss!.region;

      return new Promise((resolve, reject) => {
        cosClient.deleteObject(
          {
            Bucket: bucket,
            Region: region,
            Key: path
          },
          (err: any) => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          }
        );
      });
    } else {
      // 阿里云 OSS
      const ossClient = client as OSS;
      await ossClient.delete(path);
    }
  } catch (error: any) {
    console.error(`删除 OSS 文件失败 (${path}):`, error);
    throw error;
  }
}
