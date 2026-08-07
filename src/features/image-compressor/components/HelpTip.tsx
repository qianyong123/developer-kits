import { useState } from 'react';
import styles from './HelpTip.module.css';

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
  );
}

export default function HelpTip({ text }: { text: string }) {
  const [touch] = useState(isTouchDevice);
  const [open, setOpen] = useState(false);

  // 触摸设备上 tap 会先触发 mouseenter，导致第一次点击被取反，改为只用点击切换
  const hoverProps = touch
    ? {}
    : {
        onMouseEnter: () => setOpen(true),
        onMouseLeave: () => setOpen(false),
      };

  return (
    <span
      className={styles.wrap}
      {...hoverProps}
      onClick={() => setOpen((v) => !v)}
      onFocus={touch ? undefined : () => setOpen(true)}
      onBlur={touch ? undefined : () => setOpen(false)}
      tabIndex={0}
      role="button"
      aria-label="帮助"
    >
      <span className={styles.icon}>?</span>
      {open && <span className={styles.bubble}>{text}</span>}
    </span>
  );
}
