import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as logger from './logger.js';

/**
 * 缓存管理模块
 * 负责保存和读取验活结果缓存，支持断点续传
 */

// 获取当前文件所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 缓存文件路径
const CACHE_FILE = path.join(__dirname, '..', '..', '.verify-cache.json');

/**
 * 生成凭据的唯一标识
 * @param {Object} credential - 凭据对象
 * @returns {string} 凭据的唯一标识
 */
function getCredentialKey(credential) {
  // 使用 email 或 refreshToken 的前 20 个字符作为标识
  if (credential.email) {
    return credential.email;
  }
  if (credential.refreshToken) {
    return credential.refreshToken.substring(0, 20);
  }
  return 'unknown';
}

/**
 * 加载缓存
 * @returns {Promise<Object>} 缓存对象
 */
export async function loadCache() {
  try {
    const content = await fs.readFile(CACHE_FILE, 'utf-8');
    const cache = JSON.parse(content);
    logger.debug(`已加载缓存，包含 ${Object.keys(cache.results || {}).length} 条记录`);
    return cache;
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.debug('缓存文件不存在，创建新缓存');
      return { results: {}, timestamp: new Date().toISOString() };
    }
    logger.warn(`加载缓存失败: ${error.message}，创建新缓存`);
    return { results: {}, timestamp: new Date().toISOString() };
  }
}

/**
 * 保存缓存
 * @param {Object} cache - 缓存对象
 * @returns {Promise<void>}
 */
export async function saveCache(cache) {
  try {
    cache.timestamp = new Date().toISOString();
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
    logger.debug(`缓存已保存，包含 ${Object.keys(cache.results || {}).length} 条记录`);
  } catch (error) {
    logger.warn(`保存缓存失败: ${error.message}`);
  }
}

/**
 * 从缓存中获取凭据的验活结果
 * @param {Object} cache - 缓存对象
 * @param {Object} credential - 凭据对象
 * @returns {Object|null} 验活结果，如果不存在则返回 null
 */
export function getCachedResult(cache, credential) {
  const key = getCredentialKey(credential);
  return cache.results[key] || null;
}

/**
 * 将验活结果保存到缓存
 * @param {Object} cache - 缓存对象
 * @param {Object} credential - 凭据对象
 * @param {Object} result - 验活结果
 */
export function setCachedResult(cache, credential, result) {
  const key = getCredentialKey(credential);
  cache.results[key] = {
    ...result,
    cachedAt: new Date().toISOString()
  };
}

/**
 * 清除缓存
 * @returns {Promise<void>}
 */
export async function clearCache() {
  try {
    await fs.unlink(CACHE_FILE);
    logger.info('缓存已清除');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn(`清除缓存失败: ${error.message}`);
    }
  }
}

/**
 * 检查凭据是否已缓存
 * @param {Object} cache - 缓存对象
 * @param {Object} credential - 凭据对象
 * @returns {boolean} 是否已缓存
 */
export function isCached(cache, credential) {
  const key = getCredentialKey(credential);
  return key in cache.results;
}
