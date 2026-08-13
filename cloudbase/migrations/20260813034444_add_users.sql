-- users 表：登录功能演示（注册 / 登录 / Token 校验）
-- 仅云函数（service_role）访问，前端不直连本表，因此不开启 RLS
CREATE TABLE public.users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 云函数运行时使用 service_role 身份访问
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.users_id_seq TO service_role;
