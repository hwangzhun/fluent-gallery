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
    const isInputError = error instanceof SyntaxError || /像素|解码|图片|Input buffer|unsupported/i.test(error.message || '');
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
    res.status(500).json({
      success: false,
      error: '创建照片失败',
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
    res.status(500).json({
      success: false,
      error: '更新照片失败',
      message: error.message
    });
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
