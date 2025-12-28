import express from 'express';
import { PhotoDao } from '../../database/dao/photoDao';
import type { CreatePhotoInput, UpdatePhotoInput } from '../../database/types';
import { deleteFile } from '../storage';
import { getDatabase } from '../../database/db';

const router = express.Router();
const photoDao = new PhotoDao();

/**
 * 获取图库设置：是否启用图片乱序
 */
async function getRandomizeSetting(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.get("SELECT value FROM settings WHERE key = 'gallery_randomize_photos'", (err, row: any) => {
      if (err) {
        // 如果查询失败，默认返回 false
        console.warn('获取乱序设置失败，使用默认值 false:', err);
        resolve(false);
        return;
      }
      resolve(row?.value === 'true');
    });
  });
}

/**
 * 随机打乱数组（Fisher-Yates 洗牌算法）
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
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

    let photos;

    // 根据筛选条件获取照片
    if (yearNum && tagList.length > 0) {
      // 年份 + 标签（使用第一个标签）
      photos = await photoDao.getPhotosByYearAndTag(yearNum, tagList[0]);
    } else if (yearNum) {
      // 仅年份
      photos = await photoDao.getPhotosByYear(yearNum);
    } else if (tagList.length > 0) {
      // 仅标签（使用第一个标签，多标签暂不支持，需要扩展）
      photos = await photoDao.getPhotosByTag(tagList[0]);
    } else {
      // 获取所有照片
      photos = await photoDao.getAllPhotos();
    }

    // 如果有搜索关键词，在前端进行过滤（或者可以在后端实现）
    // 注意：这里简化处理，实际应该在后端实现搜索功能
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      photos = photos.filter(photo => 
        photo.title?.toLowerCase().includes(searchLower) ||
        photo.description?.toLowerCase().includes(searchLower)
      );
    }

    // 检查是否启用乱序（仅在主页，即无筛选条件时）
    if (!searchQuery && !yearNum && tagList.length === 0) {
      const randomizePhotos = await getRandomizeSetting();
      if (randomizePhotos) {
        photos = shuffleArray(photos);
      }
    }

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
router.post('/', async (req, res) => {
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
router.put('/:id', async (req, res) => {
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
router.delete('/:id', async (req, res) => {
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

