import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { messages } from '../shared/i18n/zh';
import styles from './AppShell.module.css';

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>{messages.app.brand}</div>
        <nav className={styles.nav}>
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
          >
            {messages.app.navImage}
          </NavLink>
          <NavLink
            to="/svg"
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
          >
            {messages.app.navSvg}
          </NavLink>
          <NavLink
            to="/json"
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
          >
            {messages.app.navJson}
          </NavLink>
        </nav>
        {/* 右侧预留：后续显示登录用户信息 */}
        <div className={styles.topbarRight} aria-hidden="true" />
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
