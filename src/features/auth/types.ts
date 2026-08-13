/** 登录用户信息（auth 云函数返回的公开字段）。 */
export interface AuthUser {
  uid: string;
  username: string;
  createdAt?: string;
}

/** 登录/注册操作结果：ok 或带用户可读的错误信息。 */
export type AuthActionResult = { ok: true } | { ok: false; message: string };
