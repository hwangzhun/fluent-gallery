/**
 * OSS 存储工具类（支持阿里云 OSS 和腾讯云 COS）
 */
import OSS from 'ali-oss';
import COS from 'cos-nodejs-sdk-v5';
import { loadStorageConfig, OSSConfig, OSSProvider, StorageConfig } from './config';

// 统一的客户端类型
export type OSSClient = OSS | COS;

export const TENCENT_CI_MAX_FILE_SIZE = 32 * 1024 * 1024;

export interface TencentProcessedImages {
  url: string;
  thumbnailUrl: string;
  objectKey: string;
  thumbnailObjectKey: string;
  width: number;
  height: number;
  displayBytes: number;
  thumbnailBytes: number;
}

interface TencentProcessObject {
  Key?: string;
  Location?: string;
  Format?: string;
  Width?: string | number;
  Height?: string | number;
  Size?: string | number;
}

/**
 * 获取 OSS 客户端（根据配置选择阿里云或腾讯云）
 */
export async function getOSSClient(configOverride?: OSSConfig): Promise<OSSClient> {
  const config = configOverride ? { mode: 'oss' as const, oss: configOverride } : await loadStorageConfig();
  
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
export function normalizeUploadDir(uploadDir?: string): string {
  const normalized = (uploadDir || 'fluent_gallery').trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  return normalized || 'fluent_gallery';
}

export function generateFilePath(filename: string, prefix: string = 'photos', uploadDir: string = 'fluent_gallery'): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  
  // 提取文件扩展名
  const ext = filename.split('.').pop() || 'jpg';
  
  // 生成唯一文件名
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  const uniqueFilename = `${timestamp}-${random}.${ext}`;
  
  return `${normalizeUploadDir(uploadDir)}/${prefix}/${year}/${month}/${uniqueFilename}`;
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

export function normalizePublicUrl(value?: string): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  if (/^http:\/\//i.test(raw)) throw new Error('图片访问域名必须使用 HTTPS');
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try { parsed = new URL(candidate); } catch { throw new Error('图片访问域名格式无效'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || (parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash) {
    throw new Error('图片访问域名只能填写 HTTPS 域名，不能包含路径或查询参数');
  }
  return `https://${parsed.host}`;
}

function locationUrl(location: string, objectPath: string, publicUrl?: string): string {
  if (publicUrl) return `${publicUrl}/${objectPath.replace(/^\/+/, '')}`;
  if (!location) throw new Error('腾讯云未返回图片访问地址');
  return /^https?:\/\//i.test(location) ? location : `https://${location}`;
}

function processObjects(data: any): TencentProcessObject[] {
  const result = data?.UploadResult || data;
  const objects = result?.ProcessResults?.Object;
  if (!objects) return [];
  return Array.isArray(objects) ? objects : [objects];
}

function deleteTencentObjects(client: COS, bucket: string, region: string, paths: string[]) {
  return Promise.allSettled(paths.map(Key => client.deleteObject({ Bucket: bucket, Region: region, Key })));
}

/**
 * Tencent CI stores image_process outputs with the bucket's default ACL. The
 * gallery serves those objects with unsigned URLs, so both generated variants
 * must explicitly be readable by visitors even when the bucket is private.
 */
async function publishTencentObjects(client: COS, bucket: string, region: string, paths: string[]) {
  await Promise.all(paths.map(Key => client.putObjectAcl({
    Bucket: bucket,
    Region: region,
    Key,
    ACL: 'public-read',
  })));
}

/**
 * Upload once and let Tencent CI create both AVIF variants. The display rule
 * overwrites the request object, so the original source is never retained.
 */
export async function putTencentProcessedImages(
  client: OSSClient,
  file: Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'size'>,
  config: OSSConfig,
): Promise<TencentProcessedImages> {
  const cosClient = client as COS;
  const publicUrl = normalizePublicUrl(config.publicUrl);
  if (file.size > TENCENT_CI_MAX_FILE_SIZE) throw new Error('腾讯云云端图片处理仅支持 32 MB 以内的图片');
  const displayPath = generateFilePath('image.avif', 'photos', config.uploadDir);
  const thumbnailPath = generateFilePath('image.avif', 'thumbs', config.uploadDir);
  const paths = [displayPath, thumbnailPath];
  const picOperations = JSON.stringify({
    is_pic_info: 1,
    rules: [
      { fileid: `/${displayPath}`, rule: 'imageMogr2/auto-orient/thumbnail/2560x2560>/format/avif/quality/80!' },
      { fileid: `/${thumbnailPath}`, rule: 'imageMogr2/auto-orient/thumbnail/720x720>/format/avif/quality/74!' },
    ],
  });

  try {
    const data: any = await cosClient.putObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: displayPath,
      Body: file.buffer,
      ContentLength: file.size,
      ContentType: file.mimetype || 'application/octet-stream',
      ACL: 'public-read',
      PicOperations: picOperations,
    } as any);
    const objects = processObjects(data);
    const byKey = (key: string) => objects.find(object => (object.Key || '').replace(/^\/+/, '') === key);
    const display = byKey(displayPath);
    const thumbnail = byKey(thumbnailPath);
    if (!display || !thumbnail || display.Format?.toLowerCase() !== 'avif' || thumbnail.Format?.toLowerCase() !== 'avif') {
      throw new Error('腾讯云未返回完整的 AVIF 处理结果');
    }
    const width = Number(display.Width);
    const height = Number(display.Height);
    const displayBytes = Number(display.Size);
    const thumbnailBytes = Number(thumbnail.Size);
    if (![width, height, displayBytes, thumbnailBytes].every(Number.isFinite) || width <= 0 || height <= 0 || displayBytes <= 0 || thumbnailBytes <= 0) {
      throw new Error('腾讯云返回的图片信息不完整');
    }
    return {
      url: locationUrl(display.Location || data.Location || '', displayPath, publicUrl),
      thumbnailUrl: locationUrl(thumbnail.Location || '', thumbnailPath, publicUrl),
      objectKey: displayPath,
      thumbnailObjectKey: thumbnailPath,
      width,
      height,
      displayBytes,
      thumbnailBytes,
    };
  } catch (error) {
    await deleteTencentObjects(cosClient, config.bucket, config.region, paths);
    throw error;
  }
}

/**
 * Ask Tencent CI to process an object that already exists in COS. Cloud-side
 * image processing uses POST ?image_process; putObjectCopy only returns a
 * CopyObjectResult and therefore cannot expose CI's ProcessResults.
 */
export async function putTencentProcessedObject(
  client: OSSClient,
  sourcePath: string,
  config: OSSConfig,
): Promise<TencentProcessedImages> {
  const cosClient = client as COS;
  const publicUrl = normalizePublicUrl(config.publicUrl);
  const displayPath = generateFilePath('image.avif', 'photos', config.uploadDir);
  const thumbnailPath = generateFilePath('image.avif', 'thumbs', config.uploadDir);
  const paths = [displayPath, thumbnailPath];
  const picOperations = JSON.stringify({
    is_pic_info: 1,
    rules: [
      { fileid: `/${displayPath}`, rule: 'imageMogr2/auto-orient/thumbnail/2560x2560>/format/avif/quality/80!' },
      { fileid: `/${thumbnailPath}`, rule: 'imageMogr2/auto-orient/thumbnail/720x720>/format/avif/quality/74!' },
    ],
  });
  try {
    const data: any = await new Promise((resolve, reject) => cosClient.request({
      Bucket: config.bucket,
      Region: config.region,
      Key: sourcePath,
      Method: 'POST',
      Action: 'image_process',
      Headers: { 'Pic-Operations': picOperations },
    } as any, (error: any, result: unknown) => error ? reject(error) : resolve(result)));
    const objects = processObjects(data);
    const byKey = (key: string) => objects.find(object => (object.Key || '').replace(/^\/+/, '') === key);
    const display = byKey(displayPath);
    const thumbnail = byKey(thumbnailPath);
    if (!display || !thumbnail || display.Format?.toLowerCase() !== 'avif' || thumbnail.Format?.toLowerCase() !== 'avif') {
      throw new Error('腾讯云 image_process 未返回完整的 AVIF 处理结果');
    }
    const width = Number(display.Width);
    const height = Number(display.Height);
    const displayBytes = Number(display.Size);
    const thumbnailBytes = Number(thumbnail.Size);
    if (![width, height, displayBytes, thumbnailBytes].every(Number.isFinite) || width <= 0 || height <= 0 || displayBytes <= 0 || thumbnailBytes <= 0) {
      throw new Error('腾讯云返回的图片信息不完整');
    }
    await publishTencentObjects(cosClient, config.bucket, config.region, paths);
    return {
      url: locationUrl(display.Location || data.Location || '', displayPath, publicUrl),
      thumbnailUrl: locationUrl(thumbnail.Location || '', thumbnailPath, publicUrl),
      objectKey: displayPath,
      thumbnailObjectKey: thumbnailPath,
      width,
      height,
      displayBytes,
      thumbnailBytes,
    };
  } catch (error) {
    await deleteTencentObjects(cosClient, config.bucket, config.region, paths);
    throw error;
  }
}

export async function validateTencentPublicUrl(client: OSSClient, config: OSSConfig): Promise<string> {
  const cosClient = client as COS;
  const publicUrl = normalizePublicUrl(config.publicUrl);
  if (!publicUrl) return '';
  const hostname = new URL(publicUrl).hostname.toLowerCase();
  let domains: COS.GetBucketDomainResult;
  try {
    domains = await cosClient.getBucketDomain({ Bucket: config.bucket, Region: config.region });
  } catch (error) {
    const detail = error instanceof Error ? `：${error.message}` : '';
    throw new Error(`无法通过腾讯云 API 验证图片域名${detail}`);
  }
  const rule = (domains.DomainRule || []).find(item => item.Name.toLowerCase() === hostname && item.Type === 'REST' && item.Status === 'ENABLED');
  if (!rule) throw new Error('该域名未在当前腾讯云 Bucket 上以 REST 类型启用');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${publicUrl}/`, { method: 'HEAD', redirect: 'manual', signal: controller.signal });
    if (response.status >= 500 || !response.headers.get('x-cos-request-id')) throw new Error('域名未返回有效的 COS 响应');
  } catch (error) {
    if (error instanceof Error && error.message === '域名未返回有效的 COS 响应') throw error;
    throw new Error('无法通过 HTTPS 访问该图片域名');
  } finally {
    clearTimeout(timer);
  }
  return publicUrl;
}

/**
 * 上传文件到 OSS/COS
 */
export async function putOSSFile(
  client: OSSClient,
  path: string,
  buffer: Buffer,
  options?: { mime?: string }
): Promise<{ url: string; objectKey: string }> {
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
          ContentType: options?.mime || 'image/jpeg',
          ACL: 'public-read'
        },
        (err: any, data: any) => {
          if (err) {
            reject(err);
            return;
          }
          // 优先使用经过验证的自定义域名；否则使用 SDK/API 返回的精确地址。
          const url = locationUrl(data?.Location || '', path, normalizePublicUrl(config.oss?.publicUrl));
          resolve({ url, objectKey: path });
        }
      );
    });
  } else {
    // 阿里云 OSS
    const ossClient = client as OSS;
    const result = await ossClient.put(path, buffer, {
      mime: options?.mime,
      headers: { 'x-oss-object-acl': 'public-read' }
    });
    return { url: result.url, objectKey: path };
  }
}

/** Verify that a browser-direct upload reached the configured bucket. */
export async function assertOSSFileExists(
  path: string,
  override?: { config: StorageConfig; client: OSSClient },
): Promise<void> {
  const config = override?.config || await loadStorageConfig();
  if (config.mode !== 'oss' || !config.oss) throw new Error('OSS 配置不存在');
  const client = override?.client || await getOSSClient();
  if ((config.oss.provider || 'aliyun') === 'tencent') {
    await new Promise<void>((resolve, reject) => (client as COS).headObject({
      Bucket: config.oss!.bucket,
      Region: config.oss!.region,
      Key: path,
    }, error => error ? reject(error) : resolve()));
    return;
  }
  await (client as OSS).head(path);
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
