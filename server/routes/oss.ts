/**
 * OSS 相关路由
 */
import express from 'express';
import multer from 'multer';
import { getOSSClient, generateFilePath, putOSSFile } from '../storage/oss';
import { storageConfig, loadStorageConfig } from '../storage/config';

const router = express.Router();

// 配置 Multer（内存存储，用于后端代理上传）
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
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
 * GET /api/oss/sts
 * This legacy endpoint intentionally does not return storage credentials.
 * Photo uploads use a short-lived URL signed for one object instead.
 */
router.get('/sts', async (req, res) => {
  res.status(410).json({ success: false, error: '此接口已停用；照片上传使用单对象预签名 URL' });
});

/**
 * GET /api/oss/config
 * 获取存储配置信息（支持本地和 OSS 模式）
 */
router.get('/config', async (req, res) => {
  try {
    // 动态加载最新配置
    const config = await loadStorageConfig();
    
    if (config.mode === 'local') {
      // 本地模式
      res.json({
        success: true,
        data: {
          mode: 'local',
          publicUrl: config.local?.publicUrl
        }
      });
    } else if (config.mode === 'oss') {
      // OSS 模式
      res.json({
        success: true,
        data: {
          mode: 'oss',
          region: config.oss?.region,
          bucket: config.oss?.bucket,
          endpoint: config.oss?.endpoint,
          uploadDir: config.oss?.uploadDir
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        error: '未知的存储模式'
      });
    }
  } catch (error: any) {
    console.error('获取存储配置失败:', error);
    res.status(500).json({
      success: false,
      error: '获取存储配置失败',
      message: error.message
    });
  }
});

/**
 * POST /api/oss/upload
 * 后端代理上传到 OSS（用于解决 CORS 问题）
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('📤 收到后端代理上传请求');
    
    // 动态加载最新配置
    const config = await loadStorageConfig();
    console.log('✅ 存储配置加载完成，模式:', config.mode);
    
    // 检查是否配置了 OSS
    if (config.mode !== 'oss') {
      console.error('❌ 存储模式不是 OSS:', config.mode);
      return res.status(400).json({
        success: false,
        error: '当前存储模式不是 OSS，无法上传到 OSS'
      });
    }

    if (!config.oss) {
      console.error('❌ OSS 配置不存在');
      return res.status(400).json({
        success: false,
        error: 'OSS 配置不存在'
      });
    }

    if (!req.file) {
      console.error('❌ 没有上传文件');
      return res.status(400).json({
        success: false,
        error: '没有上传文件'
      });
    }

    console.log('📁 文件信息:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    // 生成文件路径
    const filename = req.file.originalname || 'upload.jpg';
    const filePath = generateFilePath(filename, 'photos', config.oss.uploadDir);
    console.log('📝 生成的文件路径:', filePath);
    
    // 获取 OSS 客户端
    console.log('🔧 正在获取 OSS 客户端...');
    const client = await getOSSClient();
    console.log('✅ OSS 客户端获取成功');
    
    // 上传到 OSS/COS
    console.log('⬆️  开始上传到 OSS/COS...');
    const result = await putOSSFile(client, filePath, req.file.buffer, {
      mime: req.file.mimetype
    });
    console.log('✅ 上传成功，URL:', result.url);

    res.json({
      success: true,
      data: {
        url: result.url,
        path: filePath,
        size: req.file.size
      }
    });
  } catch (error: any) {
    console.error('❌ 上传到 OSS 失败:', error);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({
      success: false,
      error: '上传到 OSS 失败',
      message: error.message || '未知错误',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;
