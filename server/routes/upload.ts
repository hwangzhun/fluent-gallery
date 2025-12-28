/**
 * 文件上传路由（本地模式使用）
 */

import express from 'express';
import multer from 'multer';
import { uploadLocalFile } from '../storage/local';
import { loadStorageConfig } from '../storage/config';

const router = express.Router();

// 配置 Multer（内存存储）
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片格式
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件（JPG、PNG、GIF、WebP）'));
    }
  }
});

/**
 * POST /api/upload
 * 上传文件（本地模式）
 */
router.post('/', upload.single('file'), async (req, res) => {
  try {
    // 动态加载最新配置
    const config = await loadStorageConfig();
    
    if (config.mode !== 'local') {
      return res.status(400).json({
        success: false,
        error: '当前存储模式不是本地模式，请使用 OSS 直传'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '没有上传文件'
      });
    }

    const generateThumbnail = req.body.generateThumbnail === 'true' || req.body.generateThumbnail === true;

    const result = await uploadLocalFile(req.file, generateThumbnail);

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('上传文件失败:', error);
    res.status(500).json({
      success: false,
      error: '上传文件失败',
      message: error.message
    });
  }
});

export default router;
