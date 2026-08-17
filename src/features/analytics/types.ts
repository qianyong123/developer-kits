export type AnalyticsDimension = 'day' | 'week' | 'month' | 'year' | 'total';

/** 单页面访问统计（analytics 云函数 getStats 按页面返回的行）。 */
export interface PageStat {
  path: string;
  pv: number;
  uv: number;
  last_viewed?: string;
}

/** 按期间聚合的访问统计（getStats 带 dimension 返回的行）。 */
export interface TrendStat {
  period: string;
  pv: number;
  uv: number;
}

/** 按访客聚合的访问统计（getVisitors 返回的行）。 */
export interface VisitorStat {
  visitor_key: string;
  pv: number;
  active_days: number;
  last_viewed: string;
}

/** 统计看板：一次快照返回的五个维度。 */
export interface DashboardStats {
  total: TrendStat[];
  day: TrendStat[];
  week: TrendStat[];
  month: TrendStat[];
  year: TrendStat[];
}
