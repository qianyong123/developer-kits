import { useEffect, useState } from 'react';
import { messages } from '@/shared/i18n/zh';
import { Button } from '@/shared/components/Button/Button';
import { fetchTrend } from '@/features/analytics/api';
import type { AnalyticsDimension, TrendStat } from '@/features/analytics/types';
import styles from '@/features/analytics/AnalyticsPage.module.css';

type TrendMap = Record<AnalyticsDimension, TrendStat[] | null>;

const DIMENSIONS: { key: AnalyticsDimension; label: string }[] = [
  { key: 'day', label: messages.analytics.dayTab },
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

export default function AnalyticsPage() {
  const [trends, setTrends] = useState<TrendMap>({ day: null, week: null, month: null, year: null });
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [range, setRange] = useState<{ start?: string; end?: string }>({});

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all(
      DIMENSIONS.map(({ key }) =>
        fetchTrend(key, range.start, range.end).then((rows) => [key, rows] as const),
      ),
    )
      .then((results) => {
        if (cancelled) {
          return;
        }
        const next: TrendMap = { day: null, week: null, month: null, year: null };
        for (const [dim, rows] of results) {
          next[dim] = rows;
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

        <div className={styles.cards}>
          {DIMENSIONS.map(({ key, label }) => {
            const rows = trends[key];
            const latest = rows && rows.length > 0 ? rows[0] : null;
            const top = rows ? rows.slice(0, 5) : [];
            return (
              <section key={key} className={styles.statCard}>
                <h2 className={styles.cardTitle}>{label}</h2>
                {rows === null ? (
                  <p className={styles.empty}>{messages.analytics.loading}</p>
                ) : rows.length === 0 ? (
                  <p className={styles.empty}>{messages.analytics.empty}</p>
                ) : (
                  <>
                    <div className={styles.summary}>
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryValue}>{latest?.pv}</span>
                        <span className={styles.summaryLabel}>{messages.analytics.pvLabel}</span>
                      </div>
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryValue}>{latest?.uv}</span>
                        <span className={styles.summaryLabel}>{messages.analytics.uvLabel}</span>
                      </div>
                    </div>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>{messages.analytics.periodLabel}</th>
                          <th>{messages.analytics.pvLabel}</th>
                          <th>{messages.analytics.uvLabel}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top.map((row) => (
                          <tr key={row.period}>
                            <td className={styles.path}>{row.period}</td>
                            <td>{row.pv}</td>
                            <td>{row.uv}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
