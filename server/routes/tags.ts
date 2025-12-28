import express from 'express';
import { TagDao } from '../../database/dao/tagDao';

const router = express.Router();
const tagDao = new TagDao();

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
router.post('/', async (req, res) => {
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
 * DELETE /api/tags/:id
 * 删除标签
 */
router.delete('/:id', async (req, res) => {
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

