import { useEffect, useState } from 'react';
import { messages } from '@/shared/i18n/zh';
import { Button } from '@/shared/components/Button/Button';
import { fetchStats } from '@/features/analytics/api';
import type { PageStat } from '@/features/analytics/types';
import styles from '@/features/analytics/AnalyticsPage.module.css';

function formatTime(iso?: string): string {
  if (!iso) {
    return '--';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  // 统一显示北京时间，避免不同时区浏览器看到不同时间
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

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

export default function AnalyticsPage() {
  const [stats, setStats] = useState<PageStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [range, setRange] = useState<{ start?: string; end?: string }>({});

  useEffect(() => {
    let cancelled = false;
    fetchStats(range.start, range.end)
      .then((rows) => {
        if (!cancelled) {
          setStats(rows);
        }
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

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>{messages.analytics.title}</h1>
        {error && <p className={styles.error}>{error}</p>}
        <p className={styles.note}>{messages.analytics.timeNote}</p>
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
        {stats === null && !error && <p>{messages.analytics.loading}</p>}
        {stats && stats.length === 0 && <p className={styles.empty}>{messages.analytics.empty}</p>}
        {stats && stats.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{messages.analytics.pathLabel}</th>
                <th>{messages.analytics.pvLabel}</th>
                <th>{messages.analytics.uvLabel}</th>
                <th>{messages.analytics.lastLabel}</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => (
                <tr key={row.path}>
                  <td className={styles.path}>{row.path}</td>
                  <td>{row.pv}</td>
                  <td>{row.uv}</td>
                  <td className={styles.muted}>{formatTime(row.last_viewed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
