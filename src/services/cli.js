import { Command } from 'commander';
import * as logger from '../core/logger.js';

/**
 * CLI 参数解析模块
 * 使用 commander 解析命令行参数并进行验证
 */

/**
 * 解析命令行参数
 * @returns {Object} 解析后的参数对象
 */
export function parseArguments() {
  const program = new Command();

  program
    .name('batch-verify')
    .description('批量验活脚本 - 用于批量验证 AWS 凭据的有效性')
    .version('1.0.0');

  // 定义所有命令行参数
  program
    .option(
      '-c, --config <path>',
      '凭据配置文件路径或目录路径（默认：./accounts 目录）',
      './accounts'
    )
    .option(
      '-i, --interval <seconds>',
      '请求间隔秒数（必须为正数）',
      '2'
    )
    .option(
      '-e, --emails <email1,email2,...>',
      '仅验活指定 email 的凭据（逗号分隔）'
    )
    .option(
      '-o, --output <path>',
      '输出 JSON 报告的文件路径'
    )
    .option(
      '-m, --test-message <message>',
      '自定义测试消息',
      '你好'
    )
    .option(
      '-t, --timeout <seconds>',
      '请求超时时间（必须为正数）',
      '30'
    )
    .option(
      '-v, --verbose',
      '输出详细调试信息',
      false
    )
    .option(
      '--check-kiro-api',
      '使用 Kiro API 检查账号状态（更准确但更慢）',
      false
    )
    .option(
      '--separate-files',
      '将正常账号和异常账号分别保存到不同文件',
      false
    )
    .option(
      '--update-source',
      '从源文件中移除正常账号（仅单文件模式，与 --separate-files 配合使用）',
      false
    )
    .option(
      '--force-retest',
      '强制重新测试所有凭据（忽略缓存）',
      false
    );

  // 解析参数
  // 过滤掉 pnpm/npm 传递的额外 "--" 参数
  const args = process.argv.filter(arg => arg !== '--');
  program.parse(args);
  const options = program.opts();

  // 验证参数
  validateOptions(options);

  // 处理 emails 参数（将逗号分隔的字符串转换为数组）
  if (options.emails) {
    options.emails = options.emails.split(',').map(email => email.trim()).filter(email => email);
  }

  // 转换数值参数
  options.interval = parseFloat(options.interval);
  options.timeout = parseFloat(options.timeout);

  return options;
}

/**
 * 验证命令行参数的有效性
 * @param {Object} options - 解析后的参数对象
 */
function validateOptions(options) {
  // 验证 interval 参数
  const interval = parseFloat(options.interval);
  if (isNaN(interval) || interval < 0) {
    logger.error('--interval 参数必须是非负数');
    process.exit(1);
  }

  // 验证 timeout 参数
  const timeout = parseFloat(options.timeout);
  if (isNaN(timeout) || timeout <= 0) {
    logger.error('--timeout 参数必须是正数');
    process.exit(1);
  }
}
