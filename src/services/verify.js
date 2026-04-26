import axios from 'axios';
import * as logger from '../core/logger.js';
import { checkAccountStatus } from '../api/kiro-api.js';
import { getCachedResult, setCachedResult, saveCache } from '../core/cache.js';

/**
 * 验活模块
 * 负责执行对话测试验证凭据可用性
 */

/**
 * 构建对话 API 端点 URL
 * @param {string} region - AWS 区域
 * @returns {string} 对话 API 端点 URL
 */
export function getConversationEndpoint(region) {
  // 如果未指定 region，使用默认值 us-east-1
  const effectiveRegion = region || 'us-east-1';
  return `https://q.${effectiveRegion}.amazonaws.com/generateAssistantResponse`;
}

/**
 * 构建对话请求体
 * @param {string} message - 消息内容
 * @returns {Object} 请求体对象
 */
export function buildConversationRequest(message) {
  // 生成唯一的会话 ID
  const conversationId = `verify-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  return {
    conversationState: {
      agentTaskType: 'vibe',
      chatTriggerType: 'MANUAL',
      currentMessage: {
        userInputMessage: {
          userInputMessageContext: {
            toolResults: [],
            tools: []
          },
          content: message,
          modelId: 'claude-sonnet-4',
          images: [],
          origin: 'AI_EDITOR'
        }
      },
      conversationId: conversationId,
      history: []
    }
  };
}

/**
 * 计算重试延迟时间（指数退避 + 抖动）
 * @param {number} attempt - 当前重试次数（从 0 开始）
 * @returns {number} 延迟时间（毫秒）
 */
function calculateRetryDelay(attempt) {
  const BASE_MS = 200;
  const MAX_MS = 2000;
  
  // 指数退避：200ms * 2^attempt，最大 2 秒
  const exp = BASE_MS * Math.pow(2, Math.min(attempt, 6));
  const backoff = Math.min(exp, MAX_MS);
  
  // 添加抖动（最多 25% 的 backoff）
  const jitterMax = Math.max(Math.floor(backoff / 4), 1);
  const jitter = Math.floor(Math.random() * (jitterMax + 1));
  
  return backoff + jitter;
}

/**
 * 判断是否为瞬态错误（可重试）
 * @param {number} statusCode - HTTP 状态码
 * @returns {boolean} 是否为瞬态错误
 */
function isTransientError(statusCode) {
  // 408 请求超时、429 限流、5xx 服务器错误
  return statusCode === 408 || statusCode === 429 || (statusCode >= 500 && statusCode < 600);
}

/**
 * 验证单个凭据（增强版：包含 Kiro API 状态检查和重试逻辑）
 * @param {Object} credential - 凭据对象
 * @param {string} accessToken - 访问令牌
 * @param {string} testMessage - 测试消息内容
 * @param {number} timeout - 请求超时时间（秒）
 * @param {boolean} checkKiroApi - 是否使用 Kiro API 检查账号状态
 * @returns {Promise<Object>} 验活结果对象
 */
export async function verifyCredential(credential, accessToken, testMessage, timeout, checkKiroApi = false) {
  const identifier = credential.email || '未知';
  const region = credential.region || 'us-east-1';
  const startTime = Date.now();
  
  logger.debug(`正在验活凭据 ${identifier} (region: ${region})`);

  // 如果启用了 Kiro API 检查，先检查账号状态
  if (checkKiroApi) {
    logger.debug(`使用 Kiro API 检查账号状态: ${identifier}`);
    const accountStatus = await checkAccountStatus(accessToken, timeout);
    
    if (accountStatus.status !== 'active') {
      const duration = Date.now() - startTime;
      logger.error(`凭据 ${identifier} 账号状态异常: ${accountStatus.errorMessage}`);
      
      return {
        email: identifier,
        success: false,
        accountStatus: accountStatus.status,
        error: accountStatus.errorMessage,
        timestamp: new Date().toISOString(),
        duration: duration
      };
    }
    
    logger.debug(`凭据 ${identifier} 账号状态正常`);
    
    // 在 Kiro API 检查和对话测试之间等待 1 秒，避免触发限流
    logger.debug(`等待 1.5 秒后继续对话测试...`);
    await sleep(1500);
  }

  // 构建对话端点 URL
  const endpoint = getConversationEndpoint(region);
  logger.debug(`对话端点: ${endpoint}`);

  // 构建请求体
  const requestBody = buildConversationRequest(testMessage);
  logger.debug(`请求体: ${JSON.stringify(requestBody).substring(0, 200)}...`);

  // 重试逻辑：最多重试 3 次
  const MAX_RETRIES = 3;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // 发送 POST 请求
      const response = await axios.post(endpoint, requestBody, {
        timeout: timeout * 1000, // 转换为毫秒
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        validateStatus: null // 不自动抛出错误，手动处理所有状态码
      });

      const duration = Date.now() - startTime;

      // 处理响应
      if (response.status === 200) {
        // 提取响应内容
        const responseContent = extractResponseContent(response.data);
        
        if (responseContent) {
          // 截取前 100 个字符
          const truncatedResponse = responseContent.substring(0, 100);
          
          logger.debug(`凭据 ${identifier} 验活成功，响应: ${truncatedResponse}`);
          
          return {
            email: identifier,
            success: true,
            accountStatus: 'active',
            response: truncatedResponse,
            timestamp: new Date().toISOString(),
            duration: duration
          };
        } else {
          logger.warn(`凭据 ${identifier} 响应格式异常：无法提取响应内容`);
          return {
            email: identifier,
            success: false,
            accountStatus: 'unknown',
            error: '响应格式异常：无法提取响应内容',
            statusCode: 200,
            timestamp: new Date().toISOString(),
            duration: duration
          };
        }
      }

      // 检查是否为瞬态错误（可重试）
      if (isTransientError(response.status)) {
        logger.warn(`凭据 ${identifier} 遇到瞬态错误 (${response.status})，尝试 ${attempt + 1}/${MAX_RETRIES}`);
        lastError = { response, duration };
        
        // 如果还有重试机会，等待后重试
        if (attempt + 1 < MAX_RETRIES) {
          const delay = calculateRetryDelay(attempt);
          logger.debug(`等待 ${delay}ms 后重试...`);
          await sleep(delay);
          continue;
        }
      }

      // 非瞬态错误或最后一次重试失败，返回错误结果
      return handleVerifyError(response, identifier, duration);

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // 处理网络错误
      if (error.code === 'ECONNREFUSED') {
        logger.error(`凭据 ${identifier} 验活失败: 连接被拒绝`);
        return {
          email: identifier,
          success: false,
          accountStatus: 'unknown',
          error: '连接被拒绝',
          timestamp: new Date().toISOString(),
          duration: duration
        };
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        logger.error(`凭据 ${identifier} 验活失败: 请求超时`);
        return {
          email: identifier,
          success: false,
          accountStatus: 'unknown',
          error: '请求超时',
          timestamp: new Date().toISOString(),
          duration: duration
        };
      } else if (error.code === 'ENOTFOUND') {
        logger.error(`凭据 ${identifier} 验活失败: DNS 解析失败`);
        return {
          email: identifier,
          success: false,
          accountStatus: 'unknown',
          error: 'DNS 解析失败',
          timestamp: new Date().toISOString(),
          duration: duration
        };
      } else if (error.message && !error.response) {
        // 其他网络错误
        logger.error(`凭据 ${identifier} 验活失败: ${error.message}`);
        return {
          email: identifier,
          success: false,
          accountStatus: 'unknown',
          error: `网络错误: ${error.message}`,
          timestamp: new Date().toISOString(),
          duration: duration
        };
      }

      // 如果是我们自己抛出的错误，重新抛出
      throw error;
    }
  }

  // 所有重试都失败了，返回最后一次错误
  if (lastError) {
    return handleVerifyError(lastError.response, identifier, lastError.duration);
  }

  // 理论上不应该到达这里
  return {
    email: identifier,
    success: false,
    accountStatus: 'unknown',
    error: '未知错误',
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime
  };
}

/**
 * 从响应数据中提取响应内容
 * @param {Object} data - 响应数据
 * @returns {string|null} 响应内容，如果无法提取则返回 null
 */
function extractResponseContent(data) {
  // 尝试多种可能的响应格式
  if (typeof data === 'string') {
    return data;
  }
  
  if (data && typeof data === 'object') {
    // 尝试常见的响应字段
    if (data.content) {
      return typeof data.content === 'string' ? data.content : JSON.stringify(data.content);
    }
    if (data.message) {
      return typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
    }
    if (data.response) {
      return typeof data.response === 'string' ? data.response : JSON.stringify(data.response);
    }
    
    // 如果有其他字段，返回整个对象的字符串表示
    return JSON.stringify(data);
  }
  
  return null;
}

/**
 * 处理验活错误响应
 * @param {Object} response - axios 响应对象
 * @param {string} identifier - 凭据标识
 * @param {number} duration - 请求耗时（毫秒）
 * @returns {Object} 验活结果对象
 */
function handleVerifyError(response, identifier, duration) {
  const status = response.status;
  let errorMessage;
  let errorDetail = '';

  // 尝试从响应体中提取错误信息
  if (response.data) {
    if (typeof response.data === 'string') {
      errorDetail = response.data;
    } else if (response.data.error) {
      errorDetail = response.data.error;
    } else if (response.data.error_description) {
      errorDetail = response.data.error_description;
    }
  }

  // 根据状态码提供友好的错误描述
  switch (status) {
    case 400:
      errorMessage = '请求参数无效';
      break;
    case 401:
      errorMessage = '访问令牌无效或已过期';
      break;
    case 403:
      errorMessage = '权限不足';
      break;
    case 404:
      errorMessage = 'API 端点不存在';
      break;
    case 429:
      errorMessage = '请求过于频繁，已被限流';
      break;
    case 500:
    case 502:
    case 503:
      errorMessage = 'AWS 服务暂时不可用';
      break;
    default:
      errorMessage = `HTTP ${status}`;
  }

  // 记录详细错误信息
  if (errorDetail) {
    logger.error(`凭据 ${identifier} 验活失败 (${status}): ${errorMessage} - ${errorDetail}`);
  } else {
    logger.error(`凭据 ${identifier} 验活失败 (${status}): ${errorMessage}`);
  }

  return {
    email: identifier,
    success: false,
    accountStatus: 'unknown',
    error: errorMessage,
    statusCode: status,
    timestamp: new Date().toISOString(),
    duration: duration
  };
}

/**
 * 批量验活执行器
 * @param {Array} credentials - 凭据数组
 * @param {string} testMessage - 测试消息内容
 * @param {number} interval - 请求间隔（秒）
 * @param {number} timeout - 请求超时时间（秒）
 * @param {Function} refreshAccessToken - 刷新访问令牌的函数
 * @param {boolean} checkKiroApi - 是否使用 Kiro API 检查账号状态
 * @param {Object} cache - 缓存对象
 * @param {boolean} forceRetest - 是否强制重新测试
 * @returns {Promise<Array>} 验活结果数组
 */
export async function batchVerify(credentials, testMessage, interval, timeout, refreshAccessToken, checkKiroApi = false, cache = null, forceRetest = false) {
  const results = [];
  const total = credentials.length;
  let skippedFromCache = 0;
  
  logger.info(`开始批量验活，共 ${total} 个凭据`);
  if (checkKiroApi) {
    logger.info(`已启用 Kiro API 账号状态检查`);
  }
  if (cache && !forceRetest) {
    logger.info(`已启用缓存，将跳过已测试的凭据`);
  }
  if (forceRetest) {
    logger.info(`强制重新测试模式，将忽略缓存`);
  }
  
  for (let i = 0; i < credentials.length; i++) {
    const credential = credentials[i];
    const identifier = credential.email || `索引 ${i}`;
    const progress = `[${i + 1}/${total}]`;
    
    // 检查缓存（如果启用且不是强制重测）
    if (cache && !forceRetest) {
      const cachedResult = getCachedResult(cache, credential);
      if (cachedResult) {
        logger.info(`${progress} ⊙ 凭据 ${identifier} 使用缓存结果（跳过测试）`);
        skippedFromCache++;
        
        // 恢复凭据信息
        cachedResult.credential = credential;
        results.push(cachedResult);
        continue;
      }
    }
    
    logger.info(`${progress} 正在验活凭据: ${identifier}`);
    
    try {
      // 第一步：刷新访问令牌
      logger.debug(`${progress} 正在刷新访问令牌...`);
      const accessToken = await refreshAccessToken(credential, timeout);
      
      // 第二步：执行对话测试（可选：包含 Kiro API 检查）
      logger.debug(`${progress} 正在执行验活测试...`);
      const result = await verifyCredential(credential, accessToken, testMessage, timeout, checkKiroApi);
      
      // 将原始凭据信息附加到结果中（用于后续文件分离）
      result.credential = credential;
      
      // 保存到缓存
      if (cache) {
        setCachedResult(cache, credential, result);
        await saveCache(cache);
      }
      
      results.push(result);
      
      // 输出结果
      if (result.success) {
        logger.info(`${progress} ✓ 凭据 ${identifier} 验活成功`);
      } else {
        const statusInfo = result.accountStatus ? ` [状态: ${result.accountStatus}]` : '';
        logger.error(`${progress} ✗ 凭据 ${identifier} 验活失败${statusInfo}: ${result.error}`);
      }
      
    } catch (error) {
      // 认证失败或其他错误
      logger.error(`${progress} ✗ 凭据 ${identifier} 验活失败: ${error.message}`);
      
      const result = {
        email: identifier,
        success: false,
        accountStatus: 'unknown',
        error: error.message,
        timestamp: new Date().toISOString(),
        duration: 0,
        credential: credential
      };
      
      // 保存到缓存
      if (cache) {
        setCachedResult(cache, credential, result);
        await saveCache(cache);
      }
      
      results.push(result);
    }
    
    // 如果不是最后一个凭据，等待指定的间隔时间
    if (i < credentials.length - 1) {
      logger.debug(`等待 ${interval} 秒后继续...`);
      await sleep(interval * 1000);
    }
  }
  
  logger.info(`批量验活完成，共处理 ${total} 个凭据`);
  if (skippedFromCache > 0) {
    logger.info(`从缓存跳过 ${skippedFromCache} 个凭据`);
  }
  
  return results;
}

/**
 * 睡眠函数
 * @param {number} ms - 睡眠时间（毫秒）
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
