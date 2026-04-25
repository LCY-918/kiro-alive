import fs from 'fs/promises';
import path from 'path';
import * as logger from './logger.js';

/**
 * 配置文件读取模块
 * 负责读取和解析凭据配置文件或目录
 */

/**
 * 检查路径是否为目录
 * @param {string} filePath - 文件路径
 * @returns {Promise<boolean>} 是否为目录
 */
async function isDirectory(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * 读取目录下的所有 JSON 文件
 * @param {string} dirPath - 目录路径
 * @returns {Promise<Array>} 凭据数组
 */
async function loadCredentialsFromDirectory(dirPath) {
  logger.info(`正在读取目录: ${dirPath}`);

  try {
    // 读取目录内容
    const files = await fs.readdir(dirPath);
    
    // 过滤出 JSON 文件
    const jsonFiles = files.filter(file => path.extname(file).toLowerCase() === '.json');
    
    if (jsonFiles.length === 0) {
      logger.warn(`目录 ${dirPath} 中没有找到 JSON 文件`);
      return [];
    }

    logger.info(`找到 ${jsonFiles.length} 个 JSON 文件`);

    // 读取所有 JSON 文件
    const allCredentials = [];
    for (const file of jsonFiles) {
      const filePath = path.join(dirPath, file);
      logger.debug(`正在读取文件: ${file}`);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const credentials = JSON.parse(content);

        if (Array.isArray(credentials)) {
          logger.debug(`从 ${file} 加载了 ${credentials.length} 个凭据`);
          allCredentials.push(...credentials);
        } else {
          logger.warn(`文件 ${file} 不是凭据数组，已跳过`);
        }
      } catch (error) {
        logger.warn(`读取文件 ${file} 失败: ${error.message}，已跳过`);
      }
    }

    logger.info(`从目录共加载 ${allCredentials.length} 个凭据`);
    return allCredentials;

  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.error(`目录不存在: ${dirPath}`);
      throw new Error(`目录不存在: ${dirPath}`);
    } else if (error.code === 'EACCES') {
      logger.error(`无权限读取目录: ${dirPath}`);
      throw new Error(`无权限读取目录: ${dirPath}`);
    } else {
      logger.error(`读取目录失败: ${error.message}`);
      throw new Error(`读取目录失败: ${error.message}`);
    }
  }
}

/**
 * 读取凭据配置文件或目录
 * @param {string} configPath - 配置文件路径或目录路径
 * @returns {Promise<Array>} 凭据数组
 * @throws {Error} 文件/目录不存在或格式无效时抛出错误
 */
export async function loadCredentials(configPath) {
  logger.debug(`正在加载配置: ${configPath}`);

  // 检查是否为目录
  if (await isDirectory(configPath)) {
    return await loadCredentialsFromDirectory(configPath);
  }

  // 作为单个文件处理
  logger.debug(`正在读取配置文件: ${configPath}`);

  try {
    // 读取文件内容
    const content = await fs.readFile(configPath, 'utf-8');
    logger.debug('配置文件读取成功');

    // 解析 JSON
    let credentials;
    try {
      credentials = JSON.parse(content);
    } catch (parseError) {
      logger.error(`配置文件格式无效: ${parseError.message}`);
      throw new Error(`JSON 解析失败: ${parseError.message}`);
    }

    // 验证是否为数组
    if (!Array.isArray(credentials)) {
      logger.error('配置文件必须是凭据数组');
      throw new Error('配置文件格式错误：必须是数组');
    }

    logger.info(`成功加载 ${credentials.length} 个凭据`);
    return credentials;

  } catch (error) {
    // 处理文件系统错误
    if (error.code === 'ENOENT') {
      logger.error(`配置文件不存在: ${configPath}`);
      throw new Error(`配置文件不存在: ${configPath}`);
    } else if (error.code === 'EACCES') {
      logger.error(`无权限读取配置文件: ${configPath}`);
      throw new Error(`无权限读取配置文件: ${configPath}`);
    } else if (error.message.includes('JSON 解析失败')) {
      // 重新抛出 JSON 解析错误
      throw error;
    } else {
      logger.error(`读取配置文件失败: ${error.message}`);
      throw new Error(`读取配置文件失败: ${error.message}`);
    }
  }
}

/**
 * 验证凭据对象的完整性
 * @param {Object} credential - 凭据对象
 * @param {number} index - 凭据在数组中的索引
 * @returns {boolean} 是否包含所有必要字段
 */
export function validateCredential(credential, index) {
  const identifier = credential.email || `索引 ${index}`;

  // 检查 refreshToken
  if (!credential.refreshToken || typeof credential.refreshToken !== 'string') {
    logger.warn(`凭据 ${identifier} 缺少有效的 refreshToken，已跳过`);
    return false;
  }

  // 检查 clientId
  if (!credential.clientId || typeof credential.clientId !== 'string') {
    logger.warn(`凭据 ${identifier} 缺少有效的 clientId，已跳过`);
    return false;
  }

  // 检查 clientSecret
  if (!credential.clientSecret || typeof credential.clientSecret !== 'string') {
    logger.warn(`凭据 ${identifier} 缺少有效的 clientSecret，已跳过`);
    return false;
  }

  logger.debug(`凭据 ${identifier} 验证通过`);
  return true;
}

/**
 * 过滤凭据列表
 * @param {Array} credentials - 凭据数组
 * @param {Array<string>} emails - 要保留的 email 列表
 * @returns {Array} 过滤后的凭据数组
 */
export function filterCredentials(credentials, emails) {
  if (!emails || emails.length === 0) {
    logger.debug('未指定 email 过滤，返回所有凭据');
    return credentials;
  }

  logger.debug(`正在根据 email 过滤凭据: ${emails.join(', ')}`);

  const filtered = credentials.filter(credential => {
    if (!credential.email) {
      logger.debug('跳过没有 email 字段的凭据');
      return false;
    }
    return emails.includes(credential.email);
  });

  logger.info(`过滤后保留 ${filtered.length} 个凭据`);
  return filtered;
}

/**
 * 验证并过滤凭据列表
 * 移除缺少必要字段的凭据
 * @param {Array} credentials - 凭据数组
 * @returns {Object} 包含有效凭据和跳过数量的对象
 */
export function validateAndFilterCredentials(credentials) {
  const validCredentials = [];
  let skippedCount = 0;

  credentials.forEach((credential, index) => {
    if (validateCredential(credential, index)) {
      validCredentials.push(credential);
    } else {
      skippedCount++;
    }
  });

  logger.info(`验证完成: ${validCredentials.length} 个有效凭据, ${skippedCount} 个已跳过`);

  return {
    validCredentials,
    skippedCount
  };
}
