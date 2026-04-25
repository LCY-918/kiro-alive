import chalk from 'chalk';
import log4js from 'log4js';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * 日志模块
 * 提供统一的日志输出管理，支持不同级别的日志和彩色输出
 * 同时将日志写入文件
 */

// 获取当前文件所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 是否启用详细日志模式
let verboseEnabled = false;

// 配置 log4js
log4js.configure({
  appenders: {
    // 控制台输出（仅用于内部日志，不直接使用）
    console: {
      type: 'console'
    },
    // 文件输出 - 所有日志
    file: {
      type: 'file',
      filename: path.join(__dirname, '..', '..', 'logs', 'batch-verify.log'),
      maxLogSize: 10485760, // 10MB
      backups: 5,
      compress: true
    },
    // 文件输出 - 仅错误日志
    errorFile: {
      type: 'file',
      filename: path.join(__dirname, '..', '..', 'logs', 'error.log'),
      maxLogSize: 10485760, // 10MB
      backups: 3,
      compress: true
    },
    // 错误日志过滤器
    errors: {
      type: 'logLevelFilter',
      appender: 'errorFile',
      level: 'error'
    }
  },
  categories: {
    default: {
      appenders: ['file', 'errors'],
      level: 'debug'
    }
  }
});

// 获取 logger 实例
const fileLogger = log4js.getLogger();

/**
 * 设置是否启用 verbose 模式
 * @param {boolean} enabled - 是否启用详细日志
 */
export function setVerbose(enabled) {
  verboseEnabled = enabled;
}

/**
 * 输出信息日志（绿色）
 * @param {string} message - 日志消息
 */
export function info(message) {
  console.log(chalk.green(`[INFO] ${message}`));
  fileLogger.info(message);
}

/**
 * 输出警告日志（黄色）
 * @param {string} message - 日志消息
 */
export function warn(message) {
  console.log(chalk.yellow(`[WARN] ${message}`));
  fileLogger.warn(message);
}

/**
 * 输出错误日志（红色）
 * @param {string} message - 日志消息
 */
export function error(message) {
  console.log(chalk.red(`[ERROR] ${message}`));
  fileLogger.error(message);
}

/**
 * 输出调试日志（蓝色，仅在 verbose 模式下显示）
 * @param {string} message - 日志消息
 */
export function debug(message) {
  // 总是写入文件
  fileLogger.debug(message);
  
  // 仅在 verbose 模式下输出到控制台
  if (verboseEnabled) {
    console.log(chalk.blue(`[DEBUG] ${message}`));
  }
}

/**
 * 关闭日志系统（程序退出时调用）
 */
export function shutdown() {
  log4js.shutdown();
}
