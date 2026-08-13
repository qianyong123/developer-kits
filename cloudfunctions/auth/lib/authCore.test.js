import { describe, expect, it } from 'vitest';
import {
  TOKEN_TTL_SECONDS,
  validateUsername,
  validatePassword,
  generateSalt,
  hashPassword,
  signToken,
  verifyToken,
} from './authCore.js';

const SECRET = 'test-secret';

describe('validateUsername', () => {
  it('接受 3-20 位字母、数字、下划线', () => {
    expect(validateUsername('alice')).toBe(true);
    expect(validateUsername('a_1B_c')).toBe(true);
    expect(validateUsername('x'.repeat(20))).toBe(true);
  });

  it('拒绝过短、过长、非法字符与非字符串', () => {
    expect(validateUsername('ab')).toBe(false);
    expect(validateUsername('x'.repeat(21))).toBe(false);
    expect(validateUsername('has space')).toBe(false);
    expect(validateUsername('中文名')).toBe(false);
    expect(validateUsername('')).toBe(false);
    expect(validateUsername(123)).toBe(false);
    expect(validateUsername(null)).toBe(false);
  });
});

describe('validatePassword', () => {
  it('接受 8-72 位密码', () => {
    expect(validatePassword('12345678')).toBe(true);
    expect(validatePassword('p'.repeat(72))).toBe(true);
  });

  it('拒绝过短、过长与非字符串', () => {
    expect(validatePassword('1234567')).toBe(false);
    expect(validatePassword('p'.repeat(73))).toBe(false);
    expect(validatePassword('')).toBe(false);
    expect(validatePassword(12345678)).toBe(false);
    expect(validatePassword(undefined)).toBe(false);
  });
});

describe('hashPassword', () => {
  it('相同盐与密码输出稳定哈希，且为 128 位 hex', async () => {
    const salt = generateSalt();
    const first = await hashPassword('password123', salt);
    const second = await hashPassword('password123', salt);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{128}$/);
  });

  it('不同盐产生不同哈希', async () => {
    const a = await hashPassword('password123', generateSalt());
    const b = await hashPassword('password123', generateSalt());
    expect(a).not.toBe(b);
  });

  it('不同密码产生不同哈希', async () => {
    const salt = generateSalt();
    const a = await hashPassword('password123', salt);
    const b = await hashPassword('password124', salt);
    expect(a).not.toBe(b);
  });
});

describe('signToken / verifyToken', () => {
  it('签发后可校验通过并还原 uid', () => {
    const token = signToken('user-1', SECRET);
    const payload = verifyToken(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload?.uid).toBe('user-1');
  });

  it('token 包含 7 天有效期', () => {
    const now = 1_700_000_000;
    const token = signToken('user-1', SECRET, now);
    const payload = verifyToken(token, SECRET, now);
    expect(payload?.exp).toBe(now + TOKEN_TTL_SECONDS);
  });

  it('过期 token 校验失败', () => {
    const now = 1_700_000_000;
    const token = signToken('user-1', SECRET, now);
    expect(verifyToken(token, SECRET, now + TOKEN_TTL_SECONDS + 1)).toBeNull();
  });

  it('篡改 body 或签名后校验失败', () => {
    const token = signToken('user-1', SECRET);
    const [body, signature] = token.split('.');
    expect(verifyToken(`${body}.${'A'.repeat(signature.length)}`, SECRET)).toBeNull();
    const tamperedBody = Buffer.from(JSON.stringify({ uid: 'attacker', exp: 9_999_999_999 })).toString('base64url');
    expect(verifyToken(`${tamperedBody}.${signature}`, SECRET)).toBeNull();
  });

  it('错误密钥校验失败', () => {
    const token = signToken('user-1', SECRET);
    expect(verifyToken(token, 'another-secret')).toBeNull();
  });

  it('非 token 输入返回 null 而不抛错', () => {
    expect(verifyToken('', SECRET)).toBeNull();
    expect(verifyToken('not-a-token', SECRET)).toBeNull();
    expect(verifyToken(undefined, SECRET)).toBeNull();
    expect(verifyToken('a.b.c', SECRET)).toBeNull();
  });
});
