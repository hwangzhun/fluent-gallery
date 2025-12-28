import express from 'express';
import { LikeDao } from '../../database/dao/likeDao';

const router = express.Router();
const likeDao = new LikeDao();

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
 * GET /api/photos/:id/like-status
 * 获取照片的点赞状态（用于前端初始化）
 * Query: ?fingerprint=xxx
 * 注意：这个路由必须在 GET /:id 之前定义，确保更具体的路由先匹配
 */
router.get('/:id/like-status', async (req, res) => {
  try {
    const { id: photoId } = req.params;
    const { fingerprint } = req.query;

    if (!photoId) {
      return res.status(400).json({
        success: false,
        error: '缺少照片 ID'
      });
    }

    // 获取点赞数
    const likesCount = await likeDao.getLikeCount(photoId);

    // 如果提供了指纹，检查是否已点赞
    let liked = false;
    let canLike = true;

    if (fingerprint && typeof fingerprint === 'string') {
      liked = await likeDao.hasLikedInTimeWindow(photoId, fingerprint);
      canLike = !liked;
    }

    res.json({
      success: true,
      data: {
        liked,
        likesCount,
        canLike
      }
    });
  } catch (error: any) {
    console.error('获取点赞状态失败:', error);
    res.status(500).json({
      success: false,
      error: '获取点赞状态失败',
      message: error.message
    });
  }
});

/**
 * GET /api/photos/:id/likes
 * 获取照片的点赞数（简单接口）
 */
router.get('/:id/likes', async (req, res) => {
  try {
    const { id: photoId } = req.params;

    if (!photoId) {
      return res.status(400).json({
        success: false,
        error: '缺少照片 ID'
      });
    }

    const likesCount = await likeDao.getLikeCount(photoId);

    res.json({
      success: true,
      data: {
        likesCount
      }
    });
  } catch (error: any) {
    console.error('获取点赞数失败:', error);
    res.status(500).json({
      success: false,
      error: '获取点赞数失败',
      message: error.message
    });
  }
});

/**
 * POST /api/photos/:id/like
 * 点赞照片
 * Body: { fingerprint: string }
 */
router.post('/:id/like', async (req, res) => {
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

    // 检查是否在时间窗口内已点赞（24小时）
    const hasLiked = await likeDao.hasLikedInTimeWindow(photoId, fingerprint);

    if (hasLiked) {
      // 获取当前点赞数
      const likesCount = await likeDao.getLikeCount(photoId);
      
      return res.status(200).json({
        success: false,
        error: '您已经点过赞了，24小时后可以再次点赞',
        code: 'ALREADY_LIKED',
        data: {
          liked: true,
          likesCount
        }
      });
    }

    // 添加点赞记录
    await likeDao.addLike(photoId, fingerprint, ipAddress);

    // 获取更新后的点赞数
    const likesCount = await likeDao.getLikeCount(photoId);

    res.json({
      success: true,
      data: {
        liked: true,
        likesCount
      },
      message: '点赞成功'
    });
  } catch (error: any) {
    console.error('点赞失败:', error);
    res.status(500).json({
      success: false,
      error: '点赞失败',
      message: error.message
    });
  }
});


export default router;

