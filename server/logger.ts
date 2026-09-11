import type { NextFunction, Request, Response } from 'express';
import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { format } from 'util';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_DIR = join(process.cwd(), 'logs');
const RETENTION_DAYS = 14;
let installed = false;

function dateStamp(date: Date) {
  return date.toISOString().slice(0, 10);
}

function cleanOldLogs(now: Date) {
  if (!existsSync(LOG_DIR)) return;
  const cutoff = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  for (const file of readdirSync(LOG_DIR)) {
    if (!/^fluent-gallery-\d{4}-\d{2}-\d{2}\.log$/.test(file)) continue;
    const filePath = join(LOG_DIR, file);
    if (statSync(filePath).mtimeMs < cutoff) unlinkSync(filePath);
  }
}

function appendLog(level: LogLevel, args: unknown[]) {
  try {
    const now = new Date();
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

    // 每条记录保持为一行，避免 Error 堆栈被日志面板拆成数条无时间记录。
    const message = format(...args).replace(/\r?\n/g, '\\n');
    const line = `[${now.toISOString()}] [${level}] ${message}\n`;
    appendFileSync(join(LOG_DIR, `fluent-gallery-${dateStamp(now)}.log`), line, 'utf8');
  } catch {
    // 文件日志不能反过来影响 API 服务，也不能用 console 报错造成递归。
  }
}

/**
 * 保留原有控制台输出，同时将服务端 console 日志按天写入 logs 目录。
 */
export function installFileLogger() {
  if (installed) return;
  installed = true;

  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    cleanOldLogs(new Date());
  } catch {
    // 无写权限时仍保留控制台日志，不阻止服务启动。
  }

  const original = {
    debug: console.debug.bind(console),
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.debug = (...args: unknown[]) => { original.debug(...args); appendLog('DEBUG', args); };
  console.log = (...args: unknown[]) => { original.log(...args); appendLog('INFO', args); };
  console.info = (...args: unknown[]) => { original.info(...args); appendLog('INFO', args); };
  console.warn = (...args: unknown[]) => { original.warn(...args); appendLog('WARN', args); };
  console.error = (...args: unknown[]) => { original.error(...args); appendLog('ERROR', args); };
}

/** 记录已完成的 HTTP 请求；日志接口自身不记录，避免自动刷新制造噪音。 */
export function requestLogger(request: Request, response: Response, next: NextFunction) {
  // 只记录 API/健康检查，避免生产环境把页面资源和照片访问刷满日志。
  if ((!request.path.startsWith('/api/') && request.path !== '/health') || request.path.startsWith('/api/logs')) {
    return next();
  }

  const startedAt = process.hrtime.bigint();
  response.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const message = `${request.method} ${request.originalUrl} ${response.statusCode} ${durationMs.toFixed(1)}ms`;
    if (response.statusCode >= 500) console.error(message);
    else if (response.statusCode >= 400) console.warn(message);
    else console.info(message);
  });
  next();
}
