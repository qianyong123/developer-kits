/** 单页面访问统计（analytics 云函数 getStats 返回的行）。 */
export interface PageStat {
  path: string;
  pv: number;
  uv: number;
  last_viewed?: string;
}
