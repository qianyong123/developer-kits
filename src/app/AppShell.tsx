import { useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { messages } from '@/shared/i18n/zh';
import { BrandIcon, MenuIcon } from '@/shared/components/Icons';
import { useTheme } from '@/shared/hooks/useTheme';
import { tools } from '@/app/tools';
import styles from '@/app/AppShell.module.css';

const NAV_ITEMS = tools.map((tool) => ({
  to: tool.path,
  label: messages.app[tool.titleKey],
  icon: tool.icon,
  end: tool.end,
}));

export default function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  return (
    <div className={styles.shell}>
      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>
            <BrandIcon size={22} />
          </span>
          <span className={styles.brandText}>
            <span className={styles.brandName}>{messages.app.brand}</span>
            <span className={styles.brandEn}>{messages.app.brandEn}</span>
          </span>
        </div>

        <div className={styles.toolset}>{messages.app.toolset}</div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.active}` : styles.link
              }
              onClick={() => setOpen(false)}
            >
              <Icon size={17} />
              <span className={styles.linkLabel}>{label}</span>
            </NavLink>
          ))}
        </nav>

        <button type="button" className={styles.themeToggle} onClick={toggleTheme}>
          {theme === 'light' ? messages.app.themeDark : messages.app.themeLight}
        </button>
      </aside>

      {open && <div className={styles.scrim} onClick={() => setOpen(false)} />}

      <div className={styles.body}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={styles.menuButton}
            onClick={() => setOpen(true)}
            aria-label="打开菜单"
          >
            <MenuIcon size={20} />
          </button>
          <span className={styles.topbarBrand}>{messages.app.brand}</span>
          <button type="button" className={styles.topbarTheme} onClick={toggleTheme}>
            {theme === 'light' ? messages.app.themeDark : messages.app.themeLight}
          </button>
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
