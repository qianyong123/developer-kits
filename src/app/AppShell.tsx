import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { messages } from '../shared/i18n/zh';
import styles from './AppShell.module.css';

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>{messages.app.brand}</div>
        <nav className={styles.nav}>
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
          >
            {messages.app.navImage}
          </NavLink>
          <NavLink to="/json" className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
            {messages.app.navJson}
          </NavLink>
        </nav>

      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
