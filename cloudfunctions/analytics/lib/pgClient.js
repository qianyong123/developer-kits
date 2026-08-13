'use strict';

/**
 * PG REST 客户端：云函数通过 HTTPS + service_role API Key 访问 PostgreSQL。
 * 密钥来自函数环境变量，绝不返回前端。
 */

const API_KEY = process.env.CLOUDBASE_API_KEY;
const ENV_ID = process.env.ENV_ID;
const PG_REST_BASE = ENV_ID ? `https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest` : null;

async function pgRequest(path, options = {}) {
  if (!PG_REST_BASE || !API_KEY) {
    throw new Error('云函数缺少 PG 配置（ENV_ID / CLOUDBASE_API_KEY）');
  }
  const response = await fetch(`${PG_REST_BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // 非 JSON 错误响应，仅用状态码兜底
  }
  if (!response.ok) {
    const detail =
      body && (body.message || body.code)
        ? `${body.code || ''} ${body.message || ''}`.trim()
        : `HTTP ${response.status}`;
    throw new Error(`数据库请求失败: ${detail}`);
  }
  return body;
}

module.exports = { pgRequest };
