'use strict';

/**
 * 云函数 auth：登录功能演示（注册 / 登录 / 校验当前用户）。
 *
 * 前端通过 @cloudbase/js-sdk 调用：
 *   app.callFunction({ name: 'auth', data: { action, ... } })
 *
 * action:
 * - register { username, password } -> { token, user }
 * - login    { username, password } -> { token, user }
 * - me       { token }              -> { user }
 *
 * 数据：CloudBase PostgreSQL users 表，通过 PG REST API（service_role API Key）访问，
 *      表结构由 cloudbase/migrations 下的迁移文件创建。
 * 环境变量：
 * - TOKEN_SECRET：HMAC 签名密钥，未配置时回退到演示密钥（仅限本地联调）
 * - CLOUDBASE_API_KEY：service_role API Key（仅存于函数环境变量，绝不返回前端）
 */

const {
  validateUsername,
  validatePassword,
  hashPassword,
  generateSalt,
  signToken,
  verifyToken,
} = require('./lib/authCore');

const TOKEN_SECRET = process.env.TOKEN_SECRET || 'dev-only-token-secret-do-not-use-in-prod';
const API_KEY = process.env.CLOUDBASE_API_KEY;
const ENV_ID = process.env.TCB_ENV || process.env.ENV_ID;
const PG_REST_BASE = ENV_ID ? `https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest` : null;

/** 统一响应：code 0 成功 / 1 业务错误 / 401 未登录或过期 / -1 服务异常 */
function ok(data) {
  return { code: 0, message: 'ok', data };
}

function fail(code, message) {
  return { code, message, data: null };
}

/** 调用 PG REST API；非 2xx 时抛错，不把密钥与内部细节返回给前端。 */
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

async function findUserByUsername(username) {
  const rows = await pgRequest(`/users?username=eq.${encodeURIComponent(username)}&select=*`);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function findUserById(uid) {
  const rows = await pgRequest(`/users?id=eq.${Number(uid)}&select=*`);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function handleRegister(event) {
  const { username, password } = event || {};
  if (!validateUsername(username)) {
    return fail(1, '用户名需为 3-20 位字母、数字或下划线');
  }
  if (!validatePassword(password)) {
    return fail(1, '密码至少 8 位且不超过 72 位');
  }
  if (await findUserByUsername(username)) {
    return fail(1, '用户名已被注册');
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const rows = await pgRequest('/users', {
    method: 'POST',
    body: {
      username,
      password_hash: passwordHash,
      salt,
      created_at: new Date().toISOString(),
    },
    headers: { Prefer: 'return=representation' },
  });
  const uid = rows && rows[0] ? String(rows[0].id) : null;
  if (!uid) {
    throw new Error('写入用户失败');
  }
  return ok({
    token: signToken(uid, TOKEN_SECRET),
    user: { uid, username, createdAt: rows[0].created_at },
  });
}

async function handleLogin(event) {
  const { username, password } = event || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return fail(1, '请输入用户名和密码');
  }
  const user = await findUserByUsername(username);
  if (!user) {
    // 不区分「用户不存在」与「密码错误」，避免用户名枚举
    return fail(1, '用户名或密码错误');
  }
  const passwordHash = await hashPassword(password, user.salt);
  if (passwordHash !== user.password_hash) {
    return fail(1, '用户名或密码错误');
  }
  return ok({
    token: signToken(String(user.id), TOKEN_SECRET),
    user: { uid: String(user.id), username: user.username, createdAt: user.created_at },
  });
}

async function handleMe(event) {
  const payload = verifyToken((event || {}).token, TOKEN_SECRET);
  if (!payload) {
    return fail(401, '登录已过期，请重新登录');
  }
  const user = await findUserById(payload.uid);
  if (!user) {
    return fail(401, '用户不存在，请重新登录');
  }
  return ok({
    user: { uid: String(user.id), username: user.username, createdAt: user.created_at },
  });
}

exports.main = async (event = {}) => {
  const { action } = event;
  try {
    switch (action) {
      case 'register':
        return await handleRegister(event);
      case 'login':
        return await handleLogin(event);
      case 'me':
        return await handleMe(event);
      default:
        return fail(1, `未知操作: ${String(action)}`);
    }
  } catch (error) {
    // 只记录日志，不把内部细节返回给前端
    console.error('[auth] 服务异常:', error);
    return fail(-1, '服务开小差了，请稍后重试');
  }
};
