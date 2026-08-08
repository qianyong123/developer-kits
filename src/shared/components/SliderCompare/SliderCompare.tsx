import { useRef, useState, type CSSProperties } from 'react';
import type { PreviewBg } from '../../lib/hasTransparency';
import styles from './SliderCompare.module.css';

interface Props {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  ariaLabel: string;
  background?: PreviewBg;
}

/** 拖拽分割线对比组件，鼠标 / 触摸共用 Pointer Events。 */
export default function SliderCompare({
  before,
  after,
  beforeLabel,
  afterLabel,
  ariaLabel,
  background = 'white',
}: Props) {
  const [pos, setPos] = useState(50);
  const [small, setSmall] = useState(false);
  const [smallW, setSmallW] = useState(0);
  const [smallH, setSmallH] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // 小图（原始尺寸能放进预览区）：按预览区高度的 2/3 等比放大后居中，避免过度放大
  const handleLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const wrap = ref.current;
    const img = event.currentTarget;
    if (!wrap) return;
    const { naturalWidth: nw, naturalHeight: nh } = img;
    // SVG 可能无固有尺寸（0x0），此时不套用小图逻辑，交给 contain 铺满居中
    if (!nw || !nh) {
      setSmall(false);
      return;
    }
    const fits = nw <= wrap.clientWidth && nh <= wrap.clientHeight;
    setSmall(fits);
    if (fits) {
      const scale = Math.min(
        (wrap.clientHeight * 0.88) / nh,
        (wrap.clientWidth * 0.95) / nw,
      );
      setSmallW(Math.max(1, Math.round(nw * scale)));
      setSmallH(Math.max(1, Math.round(nh * scale)));
    }
  };

  const smallStyle = small
    ? ({ '--small-w': `${smallW}px`, '--small-h': `${smallH}px` } as CSSProperties)
    : undefined;

  const updateFromClientX = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, pct)));
  };

  return (
    <div
      ref={ref}
      className={`${styles.slider} ${background === 'checker' ? styles.bgChecker : styles.bgWhite}`}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pos)}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        updateFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging.current) updateFromClientX(e.clientX);
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onKeyDown={(e) => {
        let step = 0;
        if (e.key === 'ArrowLeft') step = -5;
        else if (e.key === 'ArrowRight') step = 5;
        if (step !== 0) {
          e.preventDefault();
          setPos((p) => Math.max(0, Math.min(100, p + step)));
        }
      }}
    >
      <img
        className={`${styles.sliderImg} ${small ? styles.sliderImgSmall : ''}`}
        style={smallStyle}
        src={after}
        alt={afterLabel}
        draggable={false}
        onLoad={handleLoad}
      />
      <img
        className={`${styles.sliderImg} ${styles.sliderOverlay} ${small ? styles.sliderImgSmall : ''}`}
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)`, ...smallStyle }}
        src={before}
        alt={beforeLabel}
        draggable={false}
        onLoad={handleLoad}
      />
      <div className={styles.sliderDivider} style={{ left: `${pos}%` }}>
        <span className={styles.sliderHandle}>↔</span>
      </div>
      <span className={`${styles.sliderLabel} ${styles.sliderLabelLeft}`}>{beforeLabel}</span>
      <span className={`${styles.sliderLabel} ${styles.sliderLabelRight}`}>{afterLabel}</span>
    </div>
  );
}
