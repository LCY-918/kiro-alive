import axios from 'axios';
import * as logger from '../core/logger.js';

/**
 * AWS 认证模块
 * 负责使用 refreshToken 获取 AWS access token
 */

/**
 * 生成简单的 UUID v4
 * @returns {string} UUID 字符串
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 构建认证 API 端点 URL
 * @param {string} region - AWS 区域
 * @returns {string} 认证端点 URL
 */
export function getAuthEndpoint(region) {
  // 如果未指定 region，使用默认值 us-east-1
  const effectiveRegion = region || 'us-east-1';
  return `https://oidc.${effectiveRegion}.amazonaws.com/token`;
}

/**
 * 刷新 AWS access token
 * @param {Object} credential - 凭据对象
 * @param {number} timeout - 请求超时时间（秒）
 * @returns {Promise<string>} access token
 * @throws {Error} 认证失败时抛出错误
 */
export async function refreshAccessToken(credential, timeout) {
  const identifier = credential.email || '未知';
  const region = credential.region || 'us-east-1';
  
  logger.debug(`正在为凭据 ${identifier} 刷新 access token (region: ${region})`);

  // 构建认证端点 URL
  const endpoint = getAuthEndpoint(region);
  logger.debug(`认证端点: ${endpoint}`);

  // 构建请求体（使用 camelCase，与 AWS SDK 一致）
  const requestBody = {
    clientId: credential.clientId,
    clientSecret: credential.clientSecret,
    refreshToken: credential.refreshToken,
    grantType: 'refresh_token'
  };

  // 构建必需的 AWS SDK 头部
  const xAmzUserAgent = 'aws-sdk-js/3.980.0 KiroIDE';
  const userAgent = `aws-sdk-js/3.980.0 ua/2.1 os/Windows lang/js md/nodejs#18.0.0 api/sso-oidc#3.980.0 m/E KiroIDE`;
  const invocationId = generateUUID();

  try {
    // 发送 POST 请求
    const response = await axios.post(endpoint, requestBody, {
      timeout: timeout * 1000, // 转换为毫秒
      headers: {
        'Content-Type': 'application/json',
        'x-amz-user-agent': xAmzUserAgent,
        'user-agent': userAgent,
        'host': `oidc.${region}.amazonaws.com`,
        'amz-sdk-invocation-id': invocationId,
        'amz-sdk-request': 'attempt=1; max=4',
        'Connection': 'close'
      },
      validateStatus: null // 不自动抛出错误，手动处理所有状态码
    });

    // 处理响应
    if (response.status === 200) {
      // AWS OIDC 响应使用 camelCase
      const accessToken = response.data.accessToken || response.data.access_token;
      
      if (!accessToken) {
        logger.error(`凭据 ${identifier} 认证响应中缺少 access_token`);
        throw new Error('认证响应格式无效：缺少 access_token');
      }

      logger.debug(`凭据 ${identifier} 认证成功`);
      return accessToken;
    }

    // 处理错误状态码
    return handleAuthError(response, identifier);

  } catch (error) {
    // 处理网络错误
    if (error.code === 'ECONNREFUSED') {
      logger.error(`凭据 ${identifier} 认证失败: 连接被拒绝`);
      throw new Error('连接被拒绝');
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      logger.error(`凭据 ${identifier} 认证失败: 请求超时`);
      throw new Error('请求超时');
    } else if (error.code === 'ENOTFOUND') {
      logger.error(`凭据 ${identifier} 认证失败: DNS 解析失败`);
      throw new Error('DNS 解析失败');
    } else if (error.message && !error.response) {
      // 其他网络错误
      logger.error(`凭据 ${identifier} 认证失败: ${error.message}`);
      throw new Error(`网络错误: ${error.message}`);
    }

    // 如果是我们自己抛出的错误，直接重新抛出
    throw error;
  }
}

/**
 * 处理认证错误响应
 * @param {Object} response - axios 响应对象
 * @param {string} identifier - 凭据标识
 * @throws {Error} 抛出包含错误信息的错误
 */
function handleAuthError(response, identifier) {
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
      errorMessage = 'refreshToken 无效或已过期';
      break;
    case 401:
      errorMessage = '认证失败';
      break;
    case 403:
      errorMessage = '权限不足';
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
    logger.error(`凭据 ${identifier} 认证失败 (${status}): ${errorMessage} - ${errorDetail}`);
  } else {
    logger.error(`凭据 ${identifier} 认证失败 (${status}): ${errorMessage}`);
  }

  throw new Error(errorMessage);
}
