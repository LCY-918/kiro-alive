#!/usr/bin/env node

/**
 * 批量验活脚本主入口
 * 用于批量验证 AWS 凭据的有效性
 */

import { parseArguments } from './src/services/cli.js';
import * as logger from './src/core/logger.js';
import { loadCredentials, filterCredentials, validateAndFilterCredentials } from './src/core/config.js';
import { batchVerify } from './src/services/verify.js';
import { refreshAccessToken } from './src/api/auth.js';
import { loadCache, clearCache } from './src/core/cache.js';
import fs from 'fs/promises';

/**
 * 主函数
 */
async function main() {
  try {
    // 解析命令行参数
    const options = parseArguments();

    // 设置日志级别
    logger.setVerbose(options.verbose);

    // 输出配置信息
    logger.info('批量验活脚本启动');
    logger.debug(`配置文件路径: ${options.config}`);
    logger.debug(`请求间隔: ${options.interval} 秒`);
    logger.debug(`请求超时: ${options.timeout} 秒`);
    logger.debug(`测试消息: ${options.testMessage}`);

    if (options.emails) {
      logger.debug(`指定 email 过滤: ${options.emails.join(', ')}`);
    }

    if (options.output) {
      logger.debug(`输出报告路径: ${options.output}`);
    }

    logger.info('命令行参数解析完成');

    // 读取凭据配置文件
    logger.info('正在加载凭据配置...');
    const allCredentials = await loadCredentials(options.config);

    // 根据 email 过滤凭据
    let credentials = allCredentials;
    if (options.emails) {
      credentials = filterCredentials(allCredentials, options.emails);
      
      if (credentials.length === 0) {
        logger.warn('没有匹配的凭据，脚本退出');
        process.exit(0);
      }
    }

    // 验证凭据并过滤掉无效的
    const { validCredentials, skippedCount } = validateAndFilterCredentials(credentials);

    if (validCredentials.length === 0) {
      logger.error('没有有效的凭据可以验活');
      process.exit(1);
    }

    logger.info(`准备验活 ${validCredentials.length} 个凭据`);
    
    // 加载缓存
    let cache = null;
    if (!options.forceRetest) {
      cache = await loadCache();
      logger.info('缓存已加载');
    } else {
      logger.info('强制重新测试模式，已清除缓存');
      await clearCache();
    }
    
    // 执行批量验活
    logger.info('开始执行批量验活...');
    const results = await batchVerify(
      validCredentials,
      options.testMessage,
      options.interval,
      options.timeout,
      refreshAccessToken,
      options.checkKiroApi,
      cache,
      options.forceRetest
    );

    // 生成统计信息
    const stats = calculateStats(results, skippedCount);
    
    // 输出控制台报告
    printConsoleReport(stats, results);
    
    // 如果指定了输出文件，保存 JSON 报告
    if (options.output) {
      await saveJsonReport(results, options.output);
    }

    // 如果启用了文件分离功能
    if (options.separateFiles) {
      await separateAccountFiles(results, options.config, options.updateSource);
    }

    // 根据验活结果设置退出码
    const exitCode = stats.failed > 0 ? 1 : 0;
    
    // 关闭日志系统
    logger.shutdown();
    
    process.exit(exitCode);

  } catch (error) {
    logger.error(`程序执行失败: ${error.message}`);
    
    // 关闭日志系统
    logger.shutdown();
    
    process.exit(1);
  }
}

// 执行主函数
main();

/**
 * 计算统计信息
 * @param {Array} results - 验活结果数组
 * @param {number} skippedCount - 跳过的凭据数量
 * @returns {Object} 统计信息对象
 */
function calculateStats(results, skippedCount) {
  const total = results.length + skippedCount;
  const success = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const failedCredentials = results
    .filter(r => !r.success)
    .map(r => ({
      email: r.email,
      error: r.error,
      statusCode: r.statusCode
    }));

  return {
    total,
    success,
    failed,
    skipped: skippedCount,
    failedCredentials
  };
}

/**
 * 输出控制台报告
 * @param {Object} stats - 统计信息
 * @param {Array} results - 验活结果数组
 */
function printConsoleReport(stats, results) {
  logger.info('');
  logger.info('========== 验活报告 ==========');
  logger.info(`总凭据数: ${stats.total}`);
  logger.info(`成功: ${stats.success}`);
  logger.info(`失败: ${stats.failed}`);
  logger.info(`跳过: ${stats.skipped}`);
  logger.info('==============================');

  if (stats.failedCredentials.length > 0) {
    logger.info('');
    logger.error('失败凭据详情:');
    stats.failedCredentials.forEach((cred, index) => {
      const statusInfo = cred.statusCode ? ` (HTTP ${cred.statusCode})` : '';
      logger.error(`  ${index + 1}. ${cred.email}: ${cred.error}${statusInfo}`);
    });
  }

  logger.info('');
}

/**
 * 保存 JSON 报告
 * @param {Array} results - 验活结果数组
 * @param {string} outputPath - 输出文件路径
 */
async function saveJsonReport(results, outputPath) {
  try {
    logger.info(`正在保存 JSON 报告到: ${outputPath}`);
    
    const report = {
      timestamp: new Date().toISOString(),
      results: results
    };
    
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');
    logger.info('JSON 报告保存成功');
  } catch (error) {
    logger.error(`保存 JSON 报告失败: ${error.message}`);
    throw error;
  }
}

/**
 * 分离账号文件（将正常账号和异常账号分别保存）
 * @param {Array} results - 验活结果数组
 * @param {string} sourceFile - 源文件路径
 * @param {boolean} updateSource - 是否从源文件中移除正常账号
 */
async function separateAccountFiles(results, sourceFile, updateSource) {
  try {
    logger.info('正在分离账号文件...');
    
    // 分类账号
    const normalAccounts = [];
    const failedAccounts = [];
    
    results.forEach(result => {
      if (result.success && result.credential) {
        normalAccounts.push(result.credential);
      } else if (result.credential) {
        failedAccounts.push(result.credential);
      }
    });
    
    const timestamp = Date.now();
    
    // 确定输出目录和是否为目录模式
    let outputDir;
    let isDirectoryMode = false;
    try {
      const stats = await fs.stat(sourceFile);
      if (stats.isDirectory()) {
        outputDir = sourceFile;
        isDirectoryMode = true;
      } else {
        outputDir = sourceFile.substring(0, sourceFile.lastIndexOf('/')) || '.';
      }
    } catch {
      outputDir = '.';
    }
    
    // 保存正常账号
    if (normalAccounts.length > 0) {
      const normalFile = `${outputDir}/${normalAccounts.length}-normal-accounts-${timestamp}.json`;
      await fs.writeFile(normalFile, JSON.stringify(normalAccounts, null, 2), 'utf-8');
      logger.info(`正常账号已保存到: ${normalFile} (${normalAccounts.length} 个)`);
    }
    
    // 保存异常账号
    if (failedAccounts.length > 0) {
      const failedFile = `${outputDir}/${failedAccounts.length}-failed-accounts-${timestamp}.json`;
      await fs.writeFile(failedFile, JSON.stringify(failedAccounts, null, 2), 'utf-8');
      logger.info(`异常账号已保存到: ${failedFile} (${failedAccounts.length} 个)`);
    }
    
    // 如果启用了更新源文件，从源文件中移除正常账号
    // 注意：仅在单文件模式下支持
    if (updateSource && normalAccounts.length > 0) {
      if (isDirectoryMode) {
        logger.warn('--update-source 仅支持单文件模式，目录模式下已忽略');
      } else {
        logger.info(`正在更新源文件，移除 ${normalAccounts.length} 个正常账号...`);
        await fs.writeFile(sourceFile, JSON.stringify(failedAccounts, null, 2), 'utf-8');
        logger.info(`源文件已更新: ${sourceFile}`);
      }
    }
    
  } catch (error) {
    logger.error(`分离账号文件失败: ${error.message}`);
    throw error;
  }
}
