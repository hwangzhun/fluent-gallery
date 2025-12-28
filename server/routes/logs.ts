/**
 * 日志相关路由
 */
import express from 'express';
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

const router = express.Router();

// 日志目录
const LOG_DIR = join(process.cwd(), 'logs');

/**
 * 解析日志行
 */
function parseLogLine(line: string) {
  // 尝试解析日志格式
  const timestampMatch = line.match(/\[?(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}[.\d]*Z?)\]?/);
  const levelMatch = line.match(/(ERROR|WARN|INFO|DEBUG|❌|✅|⚠️)/);
  
  const timestamp = timestampMatch ? timestampMatch[1] : new Date().toISOString();
  const level = levelMatch ? levelMatch[1] : 'INFO';
  
  return {
    timestamp,
    level,
    message: line,
    raw: line
  };
}

/**
 * 筛选日志
 */
function filterLogs(
  logs: ReturnType<typeof parseLogLine>[],
  options: {
    level?: string;
    search?: string;
    startTime?: string;
    endTime?: string;
  }
) {
  return logs.filter(log => {
    // 级别筛选
    if (options.level && !log.level.includes(options.level)) {
      return false;
    }
    
    // 搜索筛选
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      if (!log.message.toLowerCase().includes(searchLower) && 
          !log.level.toLowerCase().includes(searchLower)) {
        return false;
      }
    }
    
    // 时间范围筛选
    if (options.startTime || options.endTime) {
      try {
        const logTime = new Date(log.timestamp).getTime();
        if (options.startTime) {
          const startTime = new Date(options.startTime).getTime();
          if (logTime < startTime) return false;
        }
        if (options.endTime) {
          const endTime = new Date(options.endTime).getTime();
          if (logTime > endTime) return false;
        }
      } catch (e) {
        // 时间解析失败，保留该日志
      }
    }
    
    return true;
  });
}

/**
 * GET /api/logs
 * 获取系统日志
 */
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      level, 
      search,
      file,
      startTime,
      endTime
    } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    // 如果没有logs目录，返回空日志
    if (!existsSync(LOG_DIR)) {
      return res.json({
        success: true,
        data: {
          logs: [],
          total: 0,
          page: pageNum,
          limit: limitNum,
          totalPages: 0
        }
      });
    }

    // 获取所有日志文件
    const logFiles = readdirSync(LOG_DIR)
      .filter(f => f.endsWith('.log'))
      .map(f => ({
        name: f,
        path: join(LOG_DIR, f),
        mtime: statSync(join(LOG_DIR, f)).mtime
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // 读取指定的日志文件或最新的日志文件
    if (logFiles.length === 0) {
      return res.json({
        success: true,
        data: {
          logs: [],
          total: 0,
          page: pageNum,
          limit: limitNum,
          totalPages: 0
        }
      });
    }

    let targetLogFile = logFiles[0];
    if (file) {
      const found = logFiles.find(f => f.name === file);
      if (found) {
        targetLogFile = found;
      }
    }

    const logContent = readFileSync(targetLogFile.path, 'utf-8');
    
    // 解析日志行
    let logLines = logContent
      .split('\n')
      .filter(line => line.trim())
      .map(parseLogLine)
      .reverse(); // 最新的在前

    // 应用筛选
    logLines = filterLogs(logLines, {
      level: level as string,
      search: search as string,
      startTime: startTime as string,
      endTime: endTime as string
    });

    // 分页
    const total = logLines.length;
    const totalPages = Math.ceil(total / limitNum);
    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum;
    const paginatedLogs = logLines.slice(start, end);

    res.json({
      success: true,
      data: {
        logs: paginatedLogs,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        file: targetLogFile.name
      }
    });
  } catch (error: any) {
    console.error('获取日志失败:', error);
    res.status(500).json({
      success: false,
      error: '获取日志失败',
      message: error.message
    });
  }
});

/**
 * GET /api/logs/files
 * 获取所有日志文件列表
 */
router.get('/files', async (req, res) => {
  try {
    if (!existsSync(LOG_DIR)) {
      return res.json({
        success: true,
        data: []
      });
    }

    const logFiles = readdirSync(LOG_DIR)
      .filter(file => file.endsWith('.log'))
      .map(file => {
        const filePath = join(LOG_DIR, file);
        const stats = statSync(filePath);
        return {
          name: file,
          size: stats.size,
          mtime: stats.mtime.toISOString(),
          path: filePath
        };
      })
      .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());

    res.json({
      success: true,
      data: logFiles
    });
  } catch (error: any) {
    console.error('获取日志文件列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取日志文件列表失败',
      message: error.message
    });
  }
});

/**
 * GET /api/logs/export
 * 导出日志
 */
router.get('/export', async (req, res) => {
  try {
    const { 
      level, 
      search,
      file,
      startTime,
      endTime
    } = req.query;

    if (!existsSync(LOG_DIR)) {
      return res.status(404).json({
        success: false,
        error: '日志目录不存在'
      });
    }

    const logFiles = readdirSync(LOG_DIR)
      .filter(f => f.endsWith('.log'))
      .map(f => ({
        name: f,
        path: join(LOG_DIR, f),
        mtime: statSync(join(LOG_DIR, f)).mtime
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    if (logFiles.length === 0) {
      return res.status(404).json({
        success: false,
        error: '没有找到日志文件'
      });
    }

    let targetLogFile = logFiles[0];
    if (file) {
      const found = logFiles.find(f => f.name === file);
      if (found) {
        targetLogFile = found;
      }
    }

    const logContent = readFileSync(targetLogFile.path, 'utf-8');
    
    let logLines = logContent
      .split('\n')
      .filter(line => line.trim())
      .map(parseLogLine)
      .reverse();

    logLines = filterLogs(logLines, {
      level: level as string,
      search: search as string,
      startTime: startTime as string,
      endTime: endTime as string
    });

    const exportContent = logLines.map(log => log.raw).join('\n');
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="logs-${Date.now()}.txt"`);
    res.send(exportContent);
  } catch (error: any) {
    console.error('导出日志失败:', error);
    res.status(500).json({
      success: false,
      error: '导出日志失败',
      message: error.message
    });
  }
});

/**
 * DELETE /api/logs/clear
 * 清空日志文件
 */
router.delete('/clear', async (req, res) => {
  try {
    const { file } = req.query;

    if (!existsSync(LOG_DIR)) {
      return res.json({
        success: true,
        message: '日志目录不存在'
      });
    }

    if (file) {
      // 清空指定文件
      const filePath = join(LOG_DIR, file as string);
      if (existsSync(filePath) && filePath.startsWith(LOG_DIR)) {
        writeFileSync(filePath, '', 'utf-8');
        return res.json({
          success: true,
          message: `已清空日志文件: ${file}`
        });
      } else {
        return res.status(400).json({
          success: false,
          error: '无效的日志文件'
        });
      }
    } else {
      // 清空所有日志文件
      const logFiles = readdirSync(LOG_DIR)
        .filter(f => f.endsWith('.log'));
      
      logFiles.forEach(f => {
        const filePath = join(LOG_DIR, f);
        writeFileSync(filePath, '', 'utf-8');
      });

      return res.json({
        success: true,
        message: `已清空 ${logFiles.length} 个日志文件`
      });
    }
  } catch (error: any) {
    console.error('清空日志失败:', error);
    res.status(500).json({
      success: false,
      error: '清空日志失败',
      message: error.message
    });
  }
});

export default router;

