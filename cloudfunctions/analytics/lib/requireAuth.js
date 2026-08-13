'use strict';

/**
 * 云函数共享鉴权：校验自签 token。
 * 用法：const { error, payload } = requireAuth(event); error 存在时直接返回。
 */

const { verifyToken } = require('./authCore');

const TOKEN_SECRET = process.env.TOKEN_SECRET || 'dev-only-token-secret-do-not-use-in-prod';

function requireAuth(event) {
  const payload = verifyToken((event || {}).token, TOKEN_SECRET);
  if (!payload) {
    return { error: { code: 401, message: '登录已过期，请重新登录', data: null } };
  }
  return { payload };
}

module.exports = { requireAuth };
