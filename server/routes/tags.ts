import express from 'express';
import { TagDao } from '../../database/dao/tagDao';
import { PhotoDao } from '../../database/dao/photoDao';
import { requireAdmin } from '../auth';

const router = express.Router();
const tagDao = new TagDao();
const photoDao = new PhotoDao();

/**
 * GET /api/tags
 * 获取所有标签
 */
router.get('/', async (req, res) => {
  try {
    const tags = await tagDao.getAllTags();
    res.json({
      success: true,
      data: tags,
      count: tags.length
    });
  } catch (error: any) {
    console.error('获取标签列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取标签列表失败',
      message: error.message
    });
  }
});

/**
 * GET /api/tags/names
 * 获取所有标签名称（用于前端筛选）
 */
router.get('/names', async (req, res) => {
  try {
    const names = await tagDao.getAllTagNames();
    res.json({
      success: true,
      data: names,
      count: names.length
    });
  } catch (error: any) {
    console.error('获取标签名称列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取标签名称列表失败',
      message: error.message
    });
  }
});

router.get('/years', async (_req, res) => {
  try {
    const years = await photoDao.getAvailableYears();
    res.json({ success: true, data: years, count: years.length });
  } catch (error: any) {
    console.error('获取年份列表失败:', error);
    res.status(500).json({ success: false, error: '获取年份列表失败', message: error.message });
  }
});

/**
 * GET /api/tags/admin
 * 获取后台标签列表及关联照片数量
 */
router.get('/admin', requireAdmin, async (_req, res) => {
  try {
    const tags = await tagDao.getAllTagsWithPhotoCount();
    res.json({
      success: true,
      data: tags.map(tag => ({
        id: tag.id,
        name: tag.name,
        created_at: tag.created_at,
        photoCount: tag.photo_count
      })),
      count: tags.length
    });
  } catch (error: any) {
    console.error('获取后台标签列表失败:', error);
    res.status(500).json({ success: false, error: '获取标签列表失败', message: error.message });
  }
});

/**
 * GET /api/tags/:id
 * 根据 ID 获取标签
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tagId = parseInt(id);

    if (isNaN(tagId)) {
      return res.status(400).json({
        success: false,
        error: '无效的标签 ID'
      });
    }

    const tag = await tagDao.getTagById(tagId);

    if (!tag) {
      return res.status(404).json({
        success: false,
        error: '标签不存在'
      });
    }

    res.json({
      success: true,
      data: tag
    });
  } catch (error: any) {
    console.error('获取标签详情失败:', error);
    res.status(500).json({
      success: false,
      error: '获取标签详情失败',
      message: error.message
    });
  }
});

/**
 * POST /api/tags
 * 创建新标签
 */
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '标签名称不能为空'
      });
    }

    const tag = await tagDao.getOrCreateTag(name.trim());

    res.status(201).json({
      success: true,
      data: tag,
      message: '标签创建成功'
    });
  } catch (error: any) {
    console.error('创建标签失败:', error);
    res.status(500).json({
      success: false,
      error: '创建标签失败',
      message: error.message
    });
  }
});

/**
 * PUT /api/tags/:id
 * 重命名标签
 */
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const tagId = Number.parseInt(req.params.id, 10);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';

    if (!Number.isInteger(tagId)) {
      return res.status(400).json({ success: false, error: '无效的标签 ID' });
    }
    if (!name) {
      return res.status(400).json({ success: false, error: '标签名称不能为空' });
    }

    const conflictingTag = await tagDao.getTagByName(name);
    if (conflictingTag && conflictingTag.id !== tagId) {
      return res.status(409).json({ success: false, error: '标签名称已存在' });
    }

    const tag = await tagDao.renameTag(tagId, name);
    if (!tag) {
      return res.status(404).json({ success: false, error: '标签不存在' });
    }

    res.json({ success: true, data: tag, message: '标签重命名成功' });
  } catch (error: any) {
    if (error?.code === 'SQLITE_CONSTRAINT') {
      return res.status(409).json({ success: false, error: '标签名称已存在' });
    }
    console.error('重命名标签失败:', error);
    res.status(500).json({ success: false, error: '重命名标签失败', message: error.message });
  }
});

/**
 * DELETE /api/tags/:id
 * 删除标签
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const tagId = parseInt(id);

    if (isNaN(tagId)) {
      return res.status(400).json({
        success: false,
        error: '无效的标签 ID'
      });
    }

    const deleted = await tagDao.deleteTag(tagId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: '标签不存在'
      });
    }

    res.json({
      success: true,
      message: '标签删除成功'
    });
  } catch (error: any) {
    console.error('删除标签失败:', error);
    res.status(500).json({
      success: false,
      error: '删除标签失败',
      message: error.message
    });
  }
});

export default router;
