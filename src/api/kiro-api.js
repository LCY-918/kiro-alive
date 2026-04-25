import axios from 'axios';
import { encode, decode } from 'cbor-x';
import * as logger from '../core/logger.js';

/**
 * Kiro API 模块
 * 负责调用 Kiro Web Portal API 检查账号状态
 */

// Kiro API 基础URL
const KIRO_API_BASE = 'https://app.kiro.dev/service/KiroWebPortalService/operation';

/**
 * 生成随机调用ID
 * @returns {string} 随机UUID
 */
function generateInvocationId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 调用 Kiro API
 * @param {string} operation - API操作名称
 * @param {Object} body - 请求体
 * @param {string} accessToken - 访问令牌
 * @param {string} idp - 身份提供商，默认为 'BuilderId'
 * @param {number} timeout - 请求超时时间（秒）
 * @returns {Promise<Object>} API响应数据
 */
async function kiroApiRequest(operation, body, accessToken, idp = 'BuilderId', timeout = 30) {
  logger.debug(`[Kiro API] 调用 ${operation}`);
  
  try {
    const response = await axios.post(
      `${KIRO_API_BASE}/${operation}`,
      Buffer.from(encode(body)),
      {
        timeout: timeout * 1000,
        headers: {
          'accept': 'application/cbor',
          'content-type': 'application/cbor',
          'smithy-protocol': 'rpc-v2-cbor',
          'amz-sdk-invocation-id': generateInvocationId(),
          'amz-sdk-request': 'attempt=1; max=1',
          'x-amz-user-agent': 'aws-sdk-js/1.0.0 kiro-account-manager/1.0.0',
          'authorization': `Bearer ${accessToken}`,
          'cookie': `Idp=${idp}; AccessToken=${accessToken}`
        },
        responseType: 'arraybuffer',
        validateStatus: null
      }
    );

    logger.debug(`[Kiro API] 响应状态: ${response.status}`);

    if (response.status !== 200) {
      // 尝试解析 CBOR 格式的错误响应
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = decode(Buffer.from(response.data));
        if (errorData.__type && errorData.message) {
          // 提取错误类型名称（去掉命名空间）
          const errorType = errorData.__type.split('#').pop() || errorData.__type;
          errorMessage = `${errorType}: ${errorData.message}`;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
        logger.debug(`[Kiro API] 错误详情:`, errorData);
      } catch {
        // 如果 CBOR 解析失败，显示原始内容
        const errorText = Buffer.from(response.data).toString('utf-8');
        logger.debug(`[Kiro API] 错误 (原始): ${errorText}`);
      }
      throw new Error(errorMessage);
    }

    const result = decode(Buffer.from(response.data));
    logger.debug(`[Kiro API] 响应数据:`, JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('连接被拒绝');
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      throw new Error('请求超时');
    } else if (error.code === 'ENOTFOUND') {
      throw new Error('DNS 解析失败');
    }
    throw error;
  }
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
 * 睡眠函数
 * @param {number} ms - 睡眠时间（毫秒）
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 检查账号状态（使用 Kiro API，带重试逻辑）
 * @param {string} accessToken - 访问令牌
 * @param {number} timeout - 请求超时时间（秒）
 * @returns {Promise<{status: string, userStatus?: string, errorMessage?: string}>} 账号状态
 */
export async function checkAccountStatus(accessToken, timeout = 30) {
  const MAX_RETRIES = 3;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // 调用 GetUserInfo API
      const userInfo = await kiroApiRequest(
        'GetUserInfo',
        { origin: 'KIRO_IDE' },
        accessToken,
        'BuilderId',
        timeout
      );

      // 检查用户状态
      if (userInfo.status && userInfo.status !== 'Active') {
        return {
          status: 'inactive',
          userStatus: userInfo.status,
          errorMessage: `用户状态异常: ${userInfo.status}`
        };
      }

      return {
        status: 'active',
        userStatus: userInfo.status
      };
    } catch (error) {
      const errorMsg = error.message || String(error);
      
      // 判断错误类型
      if (errorMsg.includes('AccountSuspendedException') || errorMsg.includes('423')) {
        return {
          status: 'banned',
          errorMessage: '账号已封禁'
        };
      } else if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
        return {
          status: 'expired',
          errorMessage: 'Token 已过期'
        };
      }
      
      // 检查是否为瞬态错误（可重试）
      const statusMatch = errorMsg.match(/HTTP (\d+)/);
      if (statusMatch) {
        const statusCode = parseInt(statusMatch[1], 10);
        if (isTransientError(statusCode)) {
          logger.warn(`[Kiro API] 遇到瞬态错误 (${statusCode})，尝试 ${attempt + 1}/${MAX_RETRIES}`);
          lastError = errorMsg;
          
          // 如果还有重试机会，等待后重试
          if (attempt + 1 < MAX_RETRIES) {
            const delay = calculateRetryDelay(attempt);
            logger.debug(`[Kiro API] 等待 ${delay}ms 后重试...`);
            await sleep(delay);
            continue;
          }
        }
      }
      
      // 非瞬态错误或最后一次重试失败，返回错误结果
      return {
        status: 'error',
        errorMessage: errorMsg
      };
    }
  }

  // 所有重试都失败了，返回最后一次错误
  return {
    status: 'error',
    errorMessage: lastError || '未知错误'
  };
}
