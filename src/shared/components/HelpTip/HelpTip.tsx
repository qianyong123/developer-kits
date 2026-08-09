import { useEffect, useRef, useState } from 'react';
import styles from '@/shared/components/HelpTip/HelpTip.module.css';

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
  );
}

export default function HelpTip({ text }: { text: string }) {
  const [touch] = useState(isTouchDevice);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  // 桌面端：点击气泡以外的区域关闭
  useEffect(() => {
    if (touch || !open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [touch, open]);

  // 移动端：居中弹层，点击遮罩关闭
  if (touch) {
    return (
      <>
        <span
          className={styles.wrap}
          onClick={() => setOpen(true)}
          tabIndex={0}
          role="button"
          aria-label="帮助"
        >
          <span className={styles.icon}>?</span>
        </span>
        {open && (
          <div
            className={styles.mask}
            onClick={() => setOpen(false)}
            role="dialog"
            aria-label="帮助说明"
          >
            <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
              {text}
            </div>
          </div>
        )}
      </>
    );
  }

  const hoverProps = {
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
  };

  return (
    <span
      ref={wrapRef}
      className={styles.wrap}
      {...hoverProps}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
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
