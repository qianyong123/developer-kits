import { useState } from 'react';
import styles from './HelpTip.module.css';

export default function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className={styles.wrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((v) => !v)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      role="button"
      aria-label="帮助"
    >
      <span className={styles.icon}>?</span>
      {open && <span className={styles.bubble}>{text}</span>}
    </span>
  );
}
