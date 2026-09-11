import { AlbumInputError } from '../../database/dao/albumDao';
import express from 'express';
import multer from 'multer';
import { PhotoDao } from '../../database/dao/photoDao';
import type { CreatePhotoInput, UpdatePhotoInput } from '../../database/types';
import { deleteFile } from '../storage';
import { requireAdmin } from '../auth';
import { processUploadedImage } from '../imageProcessing';
import { storeProcessedImages } from '../storage/processed';

const router = express.Router();
const photoDao = new PhotoDao();
const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (file.mimetype === 'image/gif' || /\.gif$/i.test(file.originalname)) return callback(new Error('不支持 GIF 动图，请转换为 JPEG、PNG、WebP 或 HEIC'));
    if (!acceptedImageTypes.has(file.mimetype) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.originalname)) return callback(new Error('仅支持 JPEG、PNG、WebP 或 HEIC 图片'));
    callback(null, true);
  },
});

function encodePhotoCursor(cursor: { createdAt: string; id: string } | null): string | null {
  return cursor ? Buffer.from(JSON.stringify(cursor)).toString('base64url') : null;
}

function decodePhotoCursor(value: unknown): { createdAt: string; id: string } | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 1000) throw new Error('游标参数无效');
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') throw new Error();
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    throw new Error('游标参数无效');
  }
}

function receivePhotoFile(request: express.Request, response: express.Response, next: express.NextFunction) {
  upload.single('file')(request, response, error => {
    if (!error) return next();
    const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? '单张图片不能超过 50 MB' : error.message;
    response.status(400).json({ success: false, error: message });
  });
}

/**
 * GET /api/photos
 * 获取所有照片（支持筛选和搜索）
 * Query params: 
 *   - year=2024
 *   - tag=Nature (单个标签，向后兼容)
 *   - tags=Nature,Landscape (多个标签，逗号分隔)
 *   - search=keyword
 */
router.get('/', async (req, res) => {
  try {
    const { year, tag, tags, search } = req.query;
    const yearNum = year ? parseInt(year as string) : null;
    const searchQuery = search as string | null;
    
    // 处理标签：支持多标签（tags参数）和单标签（tag参数，向后兼容）
    let tagList: string[] = [];
    if (tags) {
      // 多标签：逗号分隔的字符串
      tagList = (tags as string).split(',').map(t => t.trim()).filter(Boolean);
    } else if (tag) {
      // 单标签：向后兼容
      tagList = [tag as string];
    }

    const photos = await photoDao.getPhotos({ year: yearNum || undefined, tags: tagList, search: searchQuery || undefined });

    res.json({
      success: true,
      data: photos,
      count: photos.length
    });
  } catch (error: any) {
    console.error('获取照片列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取照片列表失败',
      message: error.message
    });
  }
});

/** GET /api/photos/page - 首页游标分页，避免一次读取全部照片。 */
router.get('/page', async (req, res) => {
  try {
    const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ success: false, error: 'limit 必须是 1 到 100 之间的整数' });
    }
    const year = req.query.year === undefined ? undefined : Number(req.query.year);
    if (year !== undefined && (!Number.isInteger(year) || year <= 0)) {
      return res.status(400).json({ success: false, error: '年份参数无效' });
    }
    const tags = typeof req.query.tags === 'string'
      ? req.query.tags.split(',').map(tag => tag.trim()).filter(Boolean)
      : typeof req.query.tag === 'string' && req.query.tag.trim() ? [req.query.tag.trim()] : [];
    const page = await photoDao.getPhotosCursorPage({
      limit,
      cursor: decodePhotoCursor(req.query.cursor),
      year,
      tags,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
    });
    res.json({ success: true, data: { ...page, nextCursor: encodePhotoCursor(page.nextCursor) } });
  } catch (error: any) {
    const invalidCursor = error?.message === '游标参数无效';
    res.status(invalidCursor ? 400 : 500).json({ success: false, error: invalidCursor ? error.message : '获取照片列表失败' });
  }
});

router.get('/admin', requireAdmin, async (req, res) => {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 30);
    const allowedPageSizes = [30, 60, 120];
    if (!Number.isInteger(page) || page < 1 || !allowedPageSizes.includes(pageSize)) {
      return res.status(400).json({ success: false, error: '分页参数无效，page 必须大于 0，pageSize 仅支持 30、60、120' });
    }
    const year = req.query.year === undefined ? undefined : Number(req.query.year);
    if (year !== undefined && (!Number.isInteger(year) || year <= 0)) {
      return res.status(400).json({ success: false, error: '年份参数无效' });
    }
    const tags = typeof req.query.tags === 'string' ? req.query.tags.split(',').map(tag => tag.trim()).filter(Boolean) : [];
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'latest';
    if (!['latest', 'likes', 'views'].includes(sort)) {
      return res.status(400).json({ success: false, error: '排序参数无效，sort 仅支持 latest、likes、views' });
    }
    const data = await photoDao.getPhotosPage({
      page,
      pageSize,
      albumId: typeof req.query.albumId === 'string' ? req.query.albumId : undefined,
      year,
      tags,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      sort: sort as 'latest' | 'likes' | 'views',
    });
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('获取后台照片列表失败:', error);
    res.status(500).json({ success: false, error: '获取后台照片列表失败', message: error.message });
  }
});

router.patch('/batch', requireAdmin, async (req, res) => {
  try {
    const { ids, changes } = req.body as { ids?: unknown; changes?: Record<string, unknown> };
    if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string' && id.trim())) {
      return res.status(400).json({ success: false, error: '照片 ID 列表无效' });
    }
    if (!changes || typeof changes !== 'object') return res.status(400).json({ success: false, error: '请选择至少一个要修改的字段' });
    const year = changes.year;
    if (year !== undefined && (!Number.isInteger(year) || Number(year) <= 0)) {
      return res.status(400).json({ success: false, error: '年份必须是有效整数' });
    }
    const exif = changes.exif;
    if (exif !== undefined && (!exif || typeof exif !== 'object' || Array.isArray(exif) || !Object.values(exif).every(value => typeof value === 'string'))) {
      return res.status(400).json({ success: false, error: 'EXIF 参数无效' });
    }
    const tags = changes.tags as { mode?: unknown; values?: unknown } | undefined;
    if (tags && (!['append', 'remove', 'replace'].includes(String(tags.mode)) || !Array.isArray(tags.values) || !tags.values.every(value => typeof value === 'string'))) {
      return res.status(400).json({ success: false, error: '标签批量操作无效' });
    }
    if (year === undefined && exif === undefined && !tags) return res.status(400).json({ success: false, error: '请选择至少一个要修改的字段' });
    const updated = await photoDao.batchUpdatePhotos(ids, {
      year: year === undefined ? undefined : Number(year),
      exif: exif as Record<string, string> | undefined,
      tags: tags ? { mode: tags.mode as 'append' | 'remove' | 'replace', values: tags.values as string[] } : undefined,
    });
    res.json({ success: true, data: { updated }, message: `已更新 ${updated} 张照片` });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : '批量更新照片失败';
    res.status(/不存在|选择|年份|无效/.test(message) ? 400 : 500).json({ success: false, error: message });
  }
});

router.post('/upload', requireAdmin, receivePhotoFile, async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: '没有上传文件' });
  let stored: { url: string; thumbnailUrl: string } | null = null;
  try {
    const metadata = JSON.parse(req.body.metadata || '{}');
    const title = typeof metadata.title === 'string' ? metadata.title.trim() : '';
    const year = Number(metadata.year);
    if (!title || !Number.isInteger(year) || year <= 0) {
      return res.status(400).json({ success: false, error: '标题和有效年份为必填项' });
    }
    const tags: string[] = Array.isArray(metadata.tags) ? [...new Set<string>(metadata.tags.filter((tag: unknown): tag is string => typeof tag === 'string').map((tag: string) => tag.trim()).filter(Boolean))] : [];
    const processed = await processUploadedImage(req.file);
    stored = await storeProcessedImages(processed.display, processed.thumbnail);
    const photoId = generatePhotoId();
    await photoDao.createPhoto({
      albumIds: metadata.albumIds,
      albumBeforePhotoIds: metadata.albumBeforePhotoIds,
      url: stored.url,
      thumbnail_url: stored.thumbnailUrl,
      title,
      year,
      tags,
      width: processed.width,
      height: processed.height,
      exif: metadata.exif && typeof metadata.exif === 'object' ? metadata.exif : undefined,
    }, photoId);
    const photo = await photoDao.getPhotoWithTagsById(photoId);
    res.status(201).json({
      success: true,
      data: photo,
      processing: {
        sourceBytes: req.file.size,
        displayBytes: processed.display.length,
        thumbnailBytes: processed.thumbnail.length,
        width: processed.width,
        height: processed.height,
        format: 'webp',
      },
    });
  } catch (error: any) {
    if (stored) await Promise.allSettled([deleteFile(stored.url), deleteFile(stored.thumbnailUrl)]);
    const isInputError = error instanceof AlbumInputError || error instanceof SyntaxError || /像素|解码|图片|Input buffer|unsupported/i.test(error.message || '');
    const publicMessage = error instanceof SyntaxError ? '照片元数据格式无效' : error.message;
    console.error('处理上传照片失败:', error);
    res.status(isInputError ? 400 : 500).json({ success: false, error: isInputError ? publicMessage : '上传照片失败', message: error.message });
  }
});

/**
 * GET /api/photos/:id
 * 根据 ID 获取照片详情
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const photo = await photoDao.getPhotoWithTagsById(id);

    if (!photo) {
      return res.status(404).json({
        success: false,
        error: '照片不存在'
      });
    }

    res.json({
      success: true,
      data: photo
    });
  } catch (error: any) {
    console.error('获取照片详情失败:', error);
    res.status(500).json({
      success: false,
      error: '获取照片详情失败',
      message: error.message
    });
  }
});

/**
 * POST /api/photos
 * 创建新照片
 */
router.post('/', requireAdmin, async (req, res) => {
  try {
    const input: CreatePhotoInput = req.body;

    // 验证必填字段
    if (!input.url || !input.thumbnail_url || !input.title || !input.year) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段: url, thumbnail_url, title, year'
      });
    }

    // 生成照片 ID
    const photoId = generatePhotoId();

    // 创建照片
    const photo = await photoDao.createPhoto(input, photoId);

    // 获取包含标签的照片
    const photoWithTags = await photoDao.getPhotoWithTagsById(photoId);

    res.status(201).json({
      success: true,
      data: photoWithTags,
      message: '照片创建成功'
    });
  } catch (error: any) {
    console.error('创建照片失败:', error);
    res.status(error instanceof AlbumInputError ? 400 : 500).json({
      success: false,
      error: error instanceof AlbumInputError ? error.message : '创建照片失败',
      message: error.message
    });
  }
});

/**
 * PUT /api/photos/:id
 * 更新照片
 */
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const input: UpdatePhotoInput = req.body;

    const photo = await photoDao.updatePhoto(id, input);

    if (!photo) {
      return res.status(404).json({
        success: false,
        error: '照片不存在'
      });
    }

    // 获取包含标签的照片
    const photoWithTags = await photoDao.getPhotoWithTagsById(id);

    res.json({
      success: true,
      data: photoWithTags,
      message: '照片更新成功'
    });
  } catch (error: any) {
    console.error('更新照片失败:', error);
    res.status(error instanceof AlbumInputError ? 400 : 500).json({
      success: false,
      error: error instanceof AlbumInputError ? error.message : '更新照片失败',
      message: error.message
    });
  }
});

router.delete('/batch', requireAdmin, async (req, res) => {
  try {
    const rawIds: unknown[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = [...new Set(rawIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())))];
    if (!ids.length) return res.status(400).json({ success: false, error: '请至少选择一张照片' });
    const photos = await Promise.all(ids.map(id => photoDao.getPhotoById(id)));
    if (photos.some(photo => !photo)) return res.status(404).json({ success: false, error: '部分照片不存在或已被删除' });
    const deleted = await photoDao.batchDeletePhotos(ids);
    const cleanupResults = await Promise.allSettled(photos.flatMap(photo => {
      if (!photo) return [];
      return [
        ...(photo.url ? [deleteFile(photo.url)] : []),
        ...(photo.thumbnail_url && photo.thumbnail_url !== photo.url ? [deleteFile(photo.thumbnail_url)] : []),
      ];
    }));
    const cleanupFailed = cleanupResults.filter(result => result.status === 'rejected').length;
    if (cleanupFailed) console.warn(`批量删除已提交，但有 ${cleanupFailed} 个存储文件待清理`);
    res.json({ success: true, data: { deleted, cleanupFailed }, message: `已删除 ${deleted} 张照片${cleanupFailed ? `，${cleanupFailed} 个文件待清理` : ''}` });
  } catch (error: any) {
    console.error('批量删除照片失败:', error);
    res.status(500).json({ success: false, error: '批量删除照片失败', message: error.message });
  }
});

/**
 * DELETE /api/photos/:id
 * 删除照片（包括文件）
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 先获取照片信息（用于删除文件）
    const photo = await photoDao.getPhotoById(id);
    if (!photo) {
      return res.status(404).json({
        success: false,
        error: '照片不存在'
      });
    }

    // 删除文件（自动判断存储方式）
    if (photo.url) {
      try {
        await deleteFile(photo.url);
      } catch (fileError) {
        console.warn('删除文件失败（继续删除数据库记录）:', fileError);
      }
    }

    // 删除缩略图
    if (photo.thumbnail_url && photo.thumbnail_url !== photo.url) {
      try {
        await deleteFile(photo.thumbnail_url);
      } catch (fileError) {
        console.warn('删除缩略图失败:', fileError);
      }
    }

    // 删除数据库记录
    const deleted = await photoDao.deletePhoto(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: '照片不存在'
      });
    }

    res.json({
      success: true,
      message: '照片删除成功'
    });
  } catch (error: any) {
    console.error('删除照片失败:', error);
    res.status(500).json({
      success: false,
      error: '删除照片失败',
      message: error.message
    });
  }
});

/**
 * 生成照片 ID
 */
function generatePhotoId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export default router;
