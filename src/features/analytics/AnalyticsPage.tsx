import { useEffect, useState } from 'react';
import { messages } from '@/shared/i18n/zh';
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

export default function AnalyticsPage() {
  const [stats, setStats] = useState<PageStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStats()
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
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>{messages.analytics.title}</h1>
        {error && <p className={styles.error}>{error}</p>}
        <p className={styles.note}>{messages.analytics.timeNote}</p>
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
