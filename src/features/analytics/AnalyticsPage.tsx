import { useEffect, useState } from 'react';
import { messages } from '@/shared/i18n/zh';
import { useAuthStore } from '@/features/auth/store';
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
  return date.toLocaleString('zh-CN', { hour12: false });
}

export default function AnalyticsPage() {
  const { status, token, initialize } = useAuthStore();
  const [stats, setStats] = useState<PageStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (status !== 'authenticated' || !token) {
      return;
    }
    let cancelled = false;
    fetchStats(token)
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
  }, [status, token]);

  if (status === 'checking') {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p>{messages.analytics.loading}</p>
        </div>
      </div>
    );
  }

  if (status === 'guest') {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p>{messages.analytics.needLogin}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>{messages.analytics.title}</h1>
        {error && <p className={styles.error}>{error}</p>}
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
