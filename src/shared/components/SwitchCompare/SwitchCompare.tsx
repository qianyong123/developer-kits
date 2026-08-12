import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react';
import { messages } from '@/shared/i18n/zh';
import { ratioPercent } from '@/shared/lib/format';
import styles from '@/shared/components/SwitchCompare/SwitchCompare.module.css';

const FRAME_PADDING = 14;
const MAX_HEIGHT = 420;

interface Props {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  beforeSize?: string;
  afterSize?: string;
  /** 原始体积（字节），用于计算压缩节省百分比 */
  beforeBytes?: number;
  /** 压缩后体积（字节），用于计算压缩节省百分比 */
  afterBytes?: number;
  background?: 'white' | 'checker';
  beforeAlt?: string;
  afterAlt?: string;
}

/**
 * 单张预览图：按图片原始比例缩放（只缩小不放大），不裁剪、不留空隙。
 * 通过 key 切换 src 时重新挂载，避免沿用上一张图的计算尺寸。
 */
function CompareFrame({
  src,
  alt,
  background,
}: {
  src: string;
  alt: string;
  background: 'white' | 'checker';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  const handleLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const panel = panelRef.current;
    if (!panel || !img.naturalWidth || !img.naturalHeight) return;
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    // 按实际内边距计算可用宽度，保证图片撑满预览区
    const frameEl = panel.firstElementChild as HTMLElement | null;
    const framePad = frameEl ? Number.parseFloat(getComputedStyle(frameEl).paddingLeft) : FRAME_PADDING;
    const maxW = panel.clientWidth - framePad * 2;
    const maxH =
      (isMobile
        ? window.innerHeight * 0.9
        : Math.min(window.innerHeight * 0.6, MAX_HEIGHT)) -
      FRAME_PADDING * 2;
    // 移动端撑满预览区宽度（允许放大），桌面端只缩小不放大
    const scale = isMobile
      ? Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight)
      : Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    setDims({
      w: Math.round(img.naturalWidth * scale),
      h: Math.round(img.naturalHeight * scale),
    });
  };

  return (
    <div ref={panelRef} className={styles.panel}>
      <div className={styles.frame}>
        <img
          className={`${styles.img} ${background === 'checker' ? styles.checkerImg : ''}`}
          style={dims ? { width: dims.w, height: dims.h } : undefined}
          src={src}
          alt={alt}
          onLoad={handleLoad}
        />
      </div>
    </div>
  );
}

/**
 * 左右切换对比预览：一次展示一张大图，通过顶部选项卡、两侧箭头或
 * ← → 方向键在「原图 / 压缩后」之间切换，底部始终展示两侧体积对比。
 */
export default function SwitchCompare({
  before,
  after,
  beforeLabel,
  afterLabel,
  beforeSize,
  afterSize,
  beforeBytes,
  afterBytes,
  background = 'white',
  beforeAlt,
  afterAlt,
}: Props) {
  // 打开对比弹窗默认展示压缩后结果，便于先看效果
  const [view, setView] = useState<'before' | 'after'>('after');
  const showBefore = view === 'before';
  const src = showBefore ? before : after;
  const alt = showBefore ? beforeAlt ?? beforeLabel : afterAlt ?? afterLabel;
  const size = showBefore ? beforeSize : afterSize;

  // 预加载另一张图，保证切换时立即显示
  useEffect(() => {
    const next = new Image();
    next.src = showBefore ? after : before;
  }, [showBefore, before, after]);

  // 仅当压缩后体积确实更小时展示节省百分比
  const saveRate = useMemo(() => {
    if (!beforeBytes || !afterBytes || beforeBytes <= 0 || afterBytes >= beforeBytes) {
      return null;
    }
    return ratioPercent(beforeBytes, afterBytes);
  }, [beforeBytes, afterBytes]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      setView('before');
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      setView('after');
      e.preventDefault();
    }
  };

  return (
    <div className={styles.compare} onKeyDown={handleKeyDown}>
      <div className={styles.switch} role="group" aria-label={messages.shared.compareSwitchLabel}>
        <button
          type="button"
          className={showBefore ? styles.tabActive : styles.tab}
          aria-pressed={showBefore}
          onClick={() => setView('before')}
        >
          {beforeLabel}
        </button>
        <button
          type="button"
          className={!showBefore ? styles.tabActive : styles.tab}
          aria-pressed={!showBefore}
          onClick={() => setView('after')}
        >
          {afterLabel}
        </button>
      </div>

      <div className={styles.stage}>
        <button
          type="button"
          className={styles.nav}
          aria-label={beforeLabel}
          onClick={() => setView('before')}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M10 3 5 8l5 5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className={styles.viewport}>
          <CompareFrame key={src} src={src} alt={alt} background={background} />
          <div className={styles.chip} aria-hidden="true">
            <b>{showBefore ? beforeLabel : afterLabel}</b>
            {size && <span>{size}</span>}
          </div>
        </div>
        <button
          type="button"
          className={styles.nav}
          aria-label={afterLabel}
          onClick={() => setView('after')}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="m6 3 5 5-5 5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className={styles.meta}>
        <div className={`${styles.col} ${showBefore ? styles.colActive : ''}`}>
          <div className={styles.colLabel}>{beforeLabel}</div>
          <div className={styles.colSize}>{beforeSize ?? '—'}</div>
        </div>
        <div className={styles.arrow} aria-hidden="true">
          →
        </div>
        <div className={`${styles.col} ${!showBefore ? styles.colActive : ''}`}>
          <div className={styles.colLabel}>
            {afterLabel}
            {saveRate && <span className={styles.save}>{saveRate}</span>}
          </div>
          <div className={styles.colSize}>{afterSize ?? '—'}</div>
        </div>
      </div>

      <div className={styles.hint}>{messages.shared.compareHint}</div>
    </div>
  );
}
