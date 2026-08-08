import { useRef, useState, type SyntheticEvent } from 'react';
import styles from './SideBySideCompare.module.css';

const FRAME_PADDING = 14;
const MAX_HEIGHT = 460;

interface Props {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  beforeSize?: string;
  afterSize?: string;
  background?: 'white' | 'checker';
  beforeAlt?: string;
  afterAlt?: string;
}

function CompareFrame({
  src,
  alt,
  background,
}: {
  src: string;
  alt: string;
  background: 'white' | 'checker';
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  // 预览框跟随图片比例：按图片原始比例缩放（只缩小不放大），不裁剪、不留空隙
  const handleLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const panel = panelRef.current;
    if (!panel || !img.naturalWidth || !img.naturalHeight) return;
    const maxW = panel.clientWidth - FRAME_PADDING * 2;
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    const maxH = (isMobile
      ? window.innerHeight * 0.9
      : Math.min(window.innerHeight * 0.6, MAX_HEIGHT)) - FRAME_PADDING * 2;
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    setDims({
      w: Math.round(img.naturalWidth * scale),
      h: Math.round(img.naturalHeight * scale),
    });
  };

  return (
    <figure ref={panelRef} className={styles.panel}>
      <div className={styles.frame}>
        <img
          className={`${styles.img} ${background === 'checker' ? styles.checkerImg : ''}`}
          style={dims ? { width: dims.w, height: dims.h } : undefined}
          src={src}
          alt={alt}
          onLoad={handleLoad}
        />
      </div>
    </figure>
  );
}

export default function SideBySideCompare({
  before,
  after,
  beforeLabel,
  afterLabel,
  beforeSize,
  afterSize,
  background = 'white',
  beforeAlt,
  afterAlt,
}: Props) {
  return (
    <div className={styles.compare}>
      <section className={styles.side}>
        <h4 className={styles.label}>{beforeLabel}</h4>
        <CompareFrame src={before} alt={beforeAlt ?? beforeLabel} background={background} />
        {beforeSize && <div className={styles.size}>{beforeSize}</div>}
      </section>
      <section className={styles.side}>
        <h4 className={styles.label}>{afterLabel}</h4>
        <CompareFrame src={after} alt={afterAlt ?? afterLabel} background={background} />
        {afterSize && <div className={styles.size}>{afterSize}</div>}
      </section>
    </div>
  );
}
