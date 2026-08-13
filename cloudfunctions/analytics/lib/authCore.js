'use strict';

/**
 * 云函数共享纯逻辑层：token 签发与校验。
 * 不依赖 CloudBase SDK，便于本地单测；业务函数通过 requireAuth 使用。
 *
 * 安全说明（演示层级）：
 * - token 为 HMAC-SHA256 签名，携带 uid 与过期时间，签名密钥来自环境变量；
 * - 生产环境应补充限流、refresh token，并优先考虑 CloudBase 官方登录能力。
 */

const crypto = require('crypto');

/** token 有效期：7 天（秒） */
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * 签发 token：base64url(payload).base64url(hmac-sha256(payload))
 * payload = { uid, exp }，exp 为过期时间戳（秒）。
 */
function signToken(uid, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payload = { uid, exp: nowSeconds + TOKEN_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

/** 校验 token，通过返回 { uid, exp }，否则返回 null */
function verifyToken(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string') {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [body, signature] = parts;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  // 长度不一致时 timingSafeEqual 会抛错，先比较长度，再做定长比较防时序侧信道
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.uid !== 'string' || typeof payload.exp !== 'number') {
    return null;
  }
  if (payload.exp < nowSeconds) {
    return null;
  }
  return { uid: payload.uid, exp: payload.exp };
}

module.exports = {
  TOKEN_TTL_SECONDS,
  signToken,
  verifyToken,
};
