import { useState } from 'react';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { NavLink } from 'react-router-dom';
import { messages } from '../shared/i18n/zh';
import {
  BracesIcon,
  BrandIcon,
  ClockIcon,
  CodeIcon,
  ImageIcon,
  MenuIcon,
  ZapIcon,
} from '../shared/components/Icons';
import styles from './AppShell.module.css';

type IconType = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const NAV_ITEMS: Array<{
  to: string;
  label: string;
  icon: IconType;
  end?: boolean;
  online?: boolean;
}> = [
  { to: '/', label: messages.app.navImage, icon: ImageIcon, end: true, online: true },
  { to: '/svg', label: messages.app.navSvg, icon: CodeIcon },
  { to: '/json', label: messages.app.navJson, icon: BracesIcon },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

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
          {NAV_ITEMS.map(({ to, label, icon: Icon, end, online }) => (
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
              {online && <span className={styles.onlineBadge}>{messages.app.navOnline}</span>}
            </NavLink>
          ))}
          <div className={`${styles.link} ${styles.recent}`}>
            <ClockIcon size={17} />
            <span className={styles.linkLabel}>{messages.app.recent}</span>
          </div>
        </nav>

        <div className={styles.pro}>
          <ZapIcon size={18} />
          <span>
            <strong>{messages.app.proTitle}</strong>
            <span className={styles.proSub}>{messages.app.proSubtitle}</span>
          </span>
        </div>
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
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
