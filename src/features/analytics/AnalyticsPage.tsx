import { useEffect, useState } from 'react';
import { messages } from '@/shared/i18n/zh';
import { Button } from '@/shared/components/Button/Button';
import HelpTip from '@/shared/components/HelpTip/HelpTip';
import { fetchDashboard, fetchVisitors } from '@/features/analytics/api';
import type {
  AnalyticsDimension,
  DashboardStats,
  TrendStat,
  VisitorStat,
} from '@/features/analytics/types';
import styles from '@/features/analytics/AnalyticsPage.module.css';

type TrendMap = Record<AnalyticsDimension, TrendStat[] | null>;

/** 日访问列表每页条数。 */
const DAY_PAGE_SIZE = 10;

/** 只展示汇总数量的维度（不再逐条列出）。 */
const COUNT_DIMENSIONS: { key: AnalyticsDimension; label: string }[] = [
  { key: 'total', label: messages.analytics.totalLabel },
  { key: 'week', label: messages.analytics.weekTab },
  { key: 'month', label: messages.analytics.monthTab },
  { key: 'year', label: messages.analytics.yearTab },
];

/** 取日期字符串的次日（本地日期运算，避免时区干扰）。 */
function dayAfter(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + 1);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 把 YYYY-MM-DD 转成北京时间当天零点（结束日期用次日零点，左闭右开）。 */
function toBeijingRange(startDate: string, endDate: string): { start: string; end: string } {
  return {
    start: `${startDate}T00:00:00+08:00`,
    end: `${dayAfter(endDate)}T00:00:00+08:00`,
  };
}

/** 访客 ID 脱敏：保留首尾各 4 位，中间用 * 代替。 */
function maskVisitorKey(key: string): string {
  if (key.length <= 8) {
    return key;
  }
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

/** 把 ISO 时间格式化为本地 YYYY-MM-DD HH:mm。 */
function formatViewedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export default function AnalyticsPage() {
  const [trends, setTrends] = useState<TrendMap>({
    total: null,
    day: null,
    week: null,
    month: null,
    year: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [range, setRange] = useState<{ start?: string; end?: string }>({});
  const [dayPage, setDayPage] = useState(1);
  const [visitors, setVisitors] = useState<VisitorStat[] | null>(null);
  const [visitorsError, setVisitorsError] = useState<string | null>(null);
  const [visitorPage, setVisitorPage] = useState(1);

  // 数据刷新（含清空）后回到第一页。
  useEffect(() => {
    setDayPage(1);
  }, [trends.day]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchDashboard(range.start, range.end)
      .then((data: DashboardStats) => {
        if (cancelled) {
          return;
        }
        const next: TrendMap = { total: null, day: null, week: null, month: null, year: null };
        for (const dim of Object.keys(data) as AnalyticsDimension[]) {
          next[dim] = data[dim];
        }
        setTrends(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : messages.analytics.loadFailed);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    setVisitorsError(null);
    fetchVisitors(range.start, range.end)
      .then((data: VisitorStat[]) => {
        if (!cancelled) {
          setVisitors(data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setVisitorsError(err instanceof Error ? err.message : messages.analytics.loadFailed);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  // 访客明细数据刷新（含清空）后回到第一页。
  useEffect(() => {
    setVisitorPage(1);
  }, [visitors]);

  const handleQuery = () => {
    setError(null);
    if (!startDate && !endDate) {
      setRange({});
      return;
    }
    if (!startDate || !endDate) {
      setError(messages.analytics.dateRangeHint);
      return;
    }
    if (startDate > endDate) {
      setError(messages.analytics.dateRangeInvalid);
      return;
    }
    setRange(toBeijingRange(startDate, endDate));
  };

  const handleClear = () => {
    setStartDate('');
    setEndDate('');
    setRange({});
    setError(null);
  };

  const dayRows = trends.day ?? [];
  const dayTotalPages = Math.max(1, Math.ceil(dayRows.length / DAY_PAGE_SIZE));
  const dayCurrentPage = Math.min(dayPage, dayTotalPages);
  const dayPageRows = dayRows.slice(
    (dayCurrentPage - 1) * DAY_PAGE_SIZE,
    dayCurrentPage * DAY_PAGE_SIZE,
  );
  const dayTotal = dayRows.reduce((acc, row) => ({ pv: acc.pv + row.pv, uv: acc.uv + row.uv }), {
    pv: 0,
    uv: 0,
  });
  // 查询范围的唯一访客数以 total 维度为准（跨天去重），避免按日相加重复计数。
  const rangeTotalRow = trends.total && trends.total.length > 0 ? trends.total[0] : null;
  const rangeTotal = {
    pv: rangeTotalRow?.pv ?? dayTotal.pv,
    uv: rangeTotalRow?.uv ?? dayTotal.uv,
  };
  const visitorRows = visitors ?? [];
  const visitorTotalPages = Math.max(1, Math.ceil(visitorRows.length / DAY_PAGE_SIZE));
  const visitorCurrentPage = Math.min(visitorPage, visitorTotalPages);
  const visitorPageRows = visitorRows.slice(
    (visitorCurrentPage - 1) * DAY_PAGE_SIZE,
    visitorCurrentPage * DAY_PAGE_SIZE,
  );

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>{messages.analytics.title}</h1>
        {error && <p className={styles.error}>{error}</p>}
        <p className={styles.note}>{messages.analytics.timeNote}</p>

        <div className={styles.cards}>
          {COUNT_DIMENSIONS.map(({ key, label }) => {
            const rows = trends[key];
            const latest = rows && rows.length > 0 ? rows[0] : null;
            return (
              <section key={key} className={styles.statCard}>
                <h2 className={styles.cardTitle}>{label}</h2>
                {rows === null ? (
                  <p className={styles.empty}>{messages.analytics.loading}</p>
                ) : rows.length === 0 ? (
                  <p className={styles.empty}>{messages.analytics.empty}</p>
                ) : latest ? (
                  <div className={styles.summary}>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryValue}>{latest.pv}</span>
                      <span className={styles.summaryLabel}>{messages.analytics.pvLabel}</span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryValue}>{latest.uv}</span>
                      <span className={styles.summaryLabel}>{messages.analytics.uvLabel}</span>
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>

        <section className={styles.statCard}>
          <h2 className={styles.cardTitle}>{messages.analytics.dayTab}</h2>
          <div className={styles.filters}>
            <label className={styles.field}>
              <span>{messages.analytics.startLabel}</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>{messages.analytics.endLabel}</span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
            <Button variant="primary" onClick={handleQuery}>
              {messages.analytics.query}
            </Button>
            <Button variant="outline" onClick={handleClear}>
              {messages.analytics.clear}
            </Button>
          </div>
          {trends.day === null ? (
            <p className={styles.empty}>{messages.analytics.loading}</p>
          ) : dayRows.length === 0 ? (
            <p className={styles.empty}>{messages.analytics.empty}</p>
          ) : (
            <>
              <p className={styles.rangeTotal}>
                {messages.analytics.rangeTotalLabel}：
                <span className={styles.rangeTotalValue}>{rangeTotal.pv}</span>{' '}
                {messages.analytics.pvLabel} /{' '}
                <span className={styles.rangeTotalValue}>{rangeTotal.uv}</span>{' '}
                {messages.analytics.uvLabel}
                <HelpTip text={messages.analytics.uvDedupHint} />
              </p>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{messages.analytics.periodLabel}</th>
                    <th>{messages.analytics.pvLabel}</th>
                    <th>{messages.analytics.uvLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {dayPageRows.map((row) => (
                    <tr key={row.period}>
                      <td className={styles.path}>{row.period}</td>
                      <td>{row.pv}</td>
                      <td>{row.uv}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={styles.pagination}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={dayCurrentPage <= 1}
                  onClick={() => setDayPage(dayCurrentPage - 1)}
                >
                  {messages.analytics.prevPage}
                </Button>
                <span className={styles.pageInfo}>
                  {messages.analytics.pageInfo
                    .replace('{current}', String(dayCurrentPage))
                    .replace('{total}', String(dayTotalPages))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={dayCurrentPage >= dayTotalPages}
                  onClick={() => setDayPage(dayCurrentPage + 1)}
                >
                  {messages.analytics.nextPage}
                </Button>
              </div>
            </>
          )}
        </section>

        <section className={styles.statCard}>
          <h2 className={styles.cardTitle}>{messages.analytics.visitorsTab}</h2>
          {visitorsError ? (
            <p className={styles.error}>{visitorsError}</p>
          ) : visitors === null ? (
            <p className={styles.empty}>{messages.analytics.loading}</p>
          ) : visitorRows.length === 0 ? (
            <p className={styles.empty}>{messages.analytics.empty}</p>
          ) : (
            <>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{messages.analytics.visitorLabel}</th>
                    <th>{messages.analytics.visitsLabel}</th>
                    <th>{messages.analytics.activeDaysLabel}</th>
                    <th>{messages.analytics.lastLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {visitorPageRows.map((row) => (
                    <tr key={row.visitor_key}>
                      <td className={styles.path}>{maskVisitorKey(row.visitor_key)}</td>
                      <td>{row.pv}</td>
                      <td>{row.active_days}</td>
                      <td>{formatViewedAt(row.last_viewed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={styles.pagination}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={visitorCurrentPage <= 1}
                  onClick={() => setVisitorPage(visitorCurrentPage - 1)}
                >
                  {messages.analytics.prevPage}
                </Button>
                <span className={styles.pageInfo}>
                  {messages.analytics.pageInfo
                    .replace('{current}', String(visitorCurrentPage))
                    .replace('{total}', String(visitorTotalPages))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={visitorCurrentPage >= visitorTotalPages}
                  onClick={() => setVisitorPage(visitorCurrentPage + 1)}
                >
                  {messages.analytics.nextPage}
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
