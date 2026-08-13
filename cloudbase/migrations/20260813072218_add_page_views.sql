-- page_views 表：自建页面访问统计（PV/UV）
-- 仅云函数（service_role）写入与聚合，前端不直连本表
CREATE TABLE public.page_views (
  id BIGSERIAL PRIMARY KEY,
  path TEXT NOT NULL,
  visitor_key TEXT NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_page_views_path ON public.page_views (path);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_views TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.page_views_id_seq TO service_role;
