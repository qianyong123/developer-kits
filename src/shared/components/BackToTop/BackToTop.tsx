import { useEffect, useState } from 'react';
import { ArrowUpIcon } from '@/shared/components/Icons';
import { messages } from '@/shared/i18n/zh';
import styles from '@/shared/components/BackToTop/BackToTop.module.css';

const SHOW_THRESHOLD = 300;

/** 找出实际的滚动容器：优先 overflow:auto/scroll 且有溢出的元素，其次标准滚动元素。 */
function resolveScroller(): HTMLElement {
  const candidates = [
    document.body,
    document.documentElement,
    document.scrollingElement as HTMLElement | null,
  ];
  for (const el of candidates) {
    if (!el) continue;
    const overflowY = getComputedStyle(el).overflowY;
    const scrollable =
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      el.scrollHeight > el.clientHeight + 1;
    if (scrollable) return el;
  }
  const scroller = document.scrollingElement as HTMLElement | null;
  return scroller && scroller.scrollHeight > scroller.clientHeight + 1 ? scroller : document.body;
}

/** 右下角固定“回到顶部”按钮：页面滚动超过阈值后出现，点击平滑回到顶部。 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = resolveScroller();
    const onScroll = () => setVisible(container.scrollTop > SHOW_THRESHOLD);
    container.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      className={`${styles.backToTop} ${visible ? styles.visible : ''}`}
      onClick={() => resolveScroller().scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label={messages.app.backToTop}
      title={messages.app.backToTop}
    >
      <ArrowUpIcon size={18} />
    </button>
  );
}
