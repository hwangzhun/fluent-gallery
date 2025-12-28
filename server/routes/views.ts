import express from 'express';
import { ViewDao } from '../../database/dao/viewDao';

const router = express.Router();
const viewDao = new ViewDao();

/**
 * 获取客户端 IP 地址
 */
function getClientIp(req: express.Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

/**
 * POST /api/photos/:id/view
 * 记录照片浏览量
 * Body: { fingerprint: string }
 */
router.post('/:id/view', async (req, res) => {
  try {
    const { id: photoId } = req.params;
    const { fingerprint } = req.body;

    // 验证参数
    if (!fingerprint) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: fingerprint'
      });
    }

    if (!photoId) {
      return res.status(400).json({
        success: false,
        error: '缺少照片 ID'
      });
    }

    // 获取客户端 IP（辅助验证）
    const ipAddress = getClientIp(req);

    // 检查是否在时间窗口内已浏览（24小时）
    const hasViewed = await viewDao.hasViewedInTimeWindow(photoId, fingerprint);

    if (hasViewed) {
      // 如果已浏览，返回当前浏览量（不重复统计）
      const viewsCount = await viewDao.getViewCount(photoId);
      
      return res.json({
        success: true,
        data: {
          viewed: true,
          viewsCount
        },
        message: '已记录过浏览'
      });
    }

    // 添加浏览量记录
    await viewDao.addView(photoId, fingerprint, ipAddress);

    // 获取更新后的浏览量
    const viewsCount = await viewDao.getViewCount(photoId);

    res.json({
      success: true,
      data: {
        viewed: true,
        viewsCount
      },
      message: '浏览量已记录'
    });
  } catch (error: any) {
    console.error('记录浏览量失败:', error);
    res.status(500).json({
      success: false,
      error: '记录浏览量失败',
      message: error.message
    });
  }
});

/**
 * GET /api/photos/:id/view-status
 * 获取照片的浏览量状态（用于前端初始化）
 * Query: ?fingerprint=xxx
 */
router.get('/:id/view-status', async (req, res) => {
  try {
    const { id: photoId } = req.params;
    const { fingerprint } = req.query;

    if (!photoId) {
      return res.status(400).json({
        success: false,
        error: '缺少照片 ID'
      });
    }

    // 获取浏览量
    const viewsCount = await viewDao.getViewCount(photoId);

    // 如果提供了指纹，检查是否已浏览
    let viewed = false;

    if (fingerprint && typeof fingerprint === 'string') {
      viewed = await viewDao.hasViewedInTimeWindow(photoId, fingerprint);
    }

    res.json({
      success: true,
      data: {
        viewed,
        viewsCount
      }
    });
  } catch (error: any) {
    console.error('获取浏览量状态失败:', error);
    res.status(500).json({
      success: false,
      error: '获取浏览量状态失败',
      message: error.message
    });
  }
});

/**
 * GET /api/photos/:id/views
 * 获取照片的浏览量（简单接口）
 */
router.get('/:id/views', async (req, res) => {
  try {
    const { id: photoId } = req.params;

    if (!photoId) {
      return res.status(400).json({
        success: false,
        error: '缺少照片 ID'
      });
    }

    const viewsCount = await viewDao.getViewCount(photoId);

    res.json({
      success: true,
      data: {
        viewsCount
      }
    });
  } catch (error: any) {
    console.error('获取浏览量失败:', error);
    res.status(500).json({
      success: false,
      error: '获取浏览量失败',
      message: error.message
    });
  }
});

export default router;

