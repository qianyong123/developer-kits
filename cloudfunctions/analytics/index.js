'use strict';

/**
 * 云函数 analytics：自建页面访问统计（PV/UV）。
 *
 * action:
 * - trackVisit { path, visitorKey } -> null（无需登录，匿名访客也统计）
 * - getStats { startDate?, endDate?, dimension? }（公开）
 *     dimension 为 day/week/month/year/total 时返回按期间聚合 [{ period, pv, uv }]，
 *     否则返回按页面聚合 [{ path, pv, uv, lastViewedAt }]
 *
 * 数据：PostgreSQL page_views 表，通过 PG REST + service_role API Key 访问。
 * 共享模块：lib/pgClient。
 */

const { pgRequest } = require('./lib/pgClient');

function ok(data) {
  return { code: 0, message: 'ok', data };
}

function fail(code, message) {
  return { code, message, data: null };
}

function isValidPath(path) {
  return typeof path === 'string' && path.length >= 1 && path.length <= 200 && path.startsWith('/');
}

function isValidVisitorKey(visitorKey) {
  return typeof visitorKey === 'string' && visitorKey.length >= 8 && visitorKey.length <= 64;
}

/** 解析可选的日期范围过滤；不传则返回全部数据。 */
function parseDateFilter(event) {
  const { startDate, endDate } = event || {};
  if (startDate === undefined && endDate === undefined) {
    return { filter: '' };
  }
  if (
    typeof startDate !== 'string' ||
    typeof endDate !== 'string' ||
    !startDate ||
    !endDate ||
    Number.isNaN(new Date(startDate).getTime()) ||
    Number.isNaN(new Date(endDate).getTime())
  ) {
    return { error: fail(1, '日期格式不正确') };
  }
  return {
    filter: `&viewed_at=gte.${encodeURIComponent(startDate)}&viewed_at=lt.${encodeURIComponent(endDate)}`,
  };
}

/** 解析维度参数：day / week / month / year / total；不传返回 null（按页面聚合）。 */
function parseDimension(event) {
  const { dimension } = event || {};
  if (dimension === undefined) {
    return { dimension: null };
  }
  if (
    dimension !== 'day' &&
    dimension !== 'week' &&
    dimension !== 'month' &&
    dimension !== 'year' &&
    dimension !== 'total'
  ) {
    return { error: fail(1, '维度参数不正确') };
  }
  return { dimension };
}

/** 转北京时间（UTC+8，中国无夏令时），便于按日/周/月/年分组。 */
function toBeijingDate(viewedAt) {
  const ms = new Date(viewedAt).getTime();
  if (Number.isNaN(ms)) {
    return null;
  }
  return new Date(ms + 8 * 60 * 60 * 1000);
}

/** ISO 周标签（周一起始），如 2026-W33。 */
function isoWeekLabel(date) {
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const dayNum = new Date(utc).getUTCDay() || 7;
  const thursday = new Date(utc);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** 按维度生成期间键。 */
function periodKey(viewedAt, dimension) {
  const date = toBeijingDate(viewedAt);
  if (!date) {
    return null;
  }
  const pad = (value) => String(value).padStart(2, '0');
  switch (dimension) {
    case 'day':
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
    case 'week':
      return isoWeekLabel(date);
    case 'month':
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
    case 'year':
      return String(date.getUTCFullYear());
    case 'total':
      return 'total';
    default:
      return null;
  }
}

async function handleTrackVisit(event) {
  const { path, visitorKey } = event || {};
  if (!isValidPath(path)) {
    return fail(1, '路径格式不正确');
  }
  if (!isValidVisitorKey(visitorKey)) {
    return fail(1, '访客标识不合法');
  }
  await pgRequest('/page_views', {
    method: 'POST',
    body: { path, visitor_key: visitorKey, viewed_at: new Date().toISOString() },
    headers: { Prefer: 'return=minimal' },
  });
  return ok(null);
}

async function handleGetStats(event) {
  const { error: filterError, filter } = parseDateFilter(event);
  if (filterError) {
    return filterError;
  }
  const { error: dimensionError, dimension } = parseDimension(event);
  if (dimensionError) {
    return dimensionError;
  }
  // 该网关注不支持 postgREST 分组聚合（group 参数 400），
  // 改为拉取原始行后在函数内聚合（demo 量级足够，limit 兜底防止超上限）。
  const rows = await pgRequest(
    `/page_views?select=path,visitor_key,viewed_at&order=viewed_at.desc&limit=10000${filter}`,
  );
  if (dimension) {
    const byPeriod = new Map();
    for (const row of rows || []) {
      const key = periodKey(row.viewed_at, dimension);
      if (!key) {
        continue;
      }
      const entry = byPeriod.get(key) || { period: key, pv: 0, visitorKeys: new Set() };
      entry.pv += 1;
      entry.visitorKeys.add(row.visitor_key);
      byPeriod.set(key, entry);
    }
    const trend = [...byPeriod.values()]
      .map(({ visitorKeys, ...rest }) => ({ ...rest, uv: visitorKeys.size }))
      .sort((a, b) => (a.period < b.period ? 1 : -1));
    return ok(trend);
  }
  const byPath = new Map();
  for (const row of rows || []) {
    const entry = byPath.get(row.path) || {
      path: row.path,
      pv: 0,
      visitorKeys: new Set(),
      last_viewed: row.viewed_at,
    };
    entry.pv += 1;
    entry.visitorKeys.add(row.visitor_key);
    if (!entry.last_viewed || row.viewed_at > entry.last_viewed) {
      entry.last_viewed = row.viewed_at;
    }
    byPath.set(row.path, entry);
  }
  const stats = [...byPath.values()]
    .map(({ visitorKeys, ...rest }) => ({ ...rest, uv: visitorKeys.size }))
    .sort((a, b) => b.pv - a.pv);
  return ok(stats);
}

exports.main = async (event = {}) => {
  const { action } = event;
  try {
    switch (action) {
      case 'trackVisit':
        return await handleTrackVisit(event);
      case 'getStats':
        return await handleGetStats(event);
      default:
        return fail(1, `未知操作: ${String(action)}`);
    }
  } catch (error) {
    console.error('[analytics] 服务异常:', error);
    return fail(-1, '服务开小差了，请稍后重试');
  }
};
