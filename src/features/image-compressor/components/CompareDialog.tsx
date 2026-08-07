import { useRef, useState } from 'react';
import { messages } from '../../../shared/i18n/zh';
import { formatBytes } from '../../../shared/lib/format';
import type { ImageItem } from '../lib/types';
import styles from './CompareDialog.module.css';

export default function CompareDialog({ item, onClose }: { item: ImageItem; onClose: () => void }) {
  if (!item.result) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>
          <strong>{messages.image.compareTitle}</strong>
          <button className={styles.close} onClick={onClose}>
            ✕
          </button>
        </div>

        <SliderCompare before={item.originalUrl} after={item.result.url} />

        <div className={styles.meta}>
          <span>
            {messages.image.original}: {formatBytes(item.originalSize)}
          </span>
          <span>
            {messages.image.compressed}: {formatBytes(item.result.size)}
          </span>
        </div>
      </div>
    </div>
  );
}

function SliderCompare({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updateFromClientX = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, pct)));
  };

  return (
    <div
      ref={ref}
      className={styles.slider}
      role="slider"
      tabIndex={0}
      aria-label={messages.image.compareSlide}
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
      <img className={styles.sliderImg} src={after} alt={messages.image.compressed} draggable={false} />
      <img
        className={`${styles.sliderImg} ${styles.sliderOverlay}`}
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        src={before}
        alt={messages.image.original}
        draggable={false}
      />
      <div className={styles.sliderDivider} style={{ left: `${pos}%` }}>
        <span className={styles.sliderHandle}>↔</span>
      </div>
      <span className={`${styles.sliderLabel} ${styles.sliderLabelLeft}`}>{messages.image.original}</span>
      <span className={`${styles.sliderLabel} ${styles.sliderLabelRight}`}>{messages.image.compressed}</span>
    </div>
  );
}