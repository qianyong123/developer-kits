import { useRef, useState } from 'react';
import { messages } from '../../../shared/i18n/zh';
import { formatBytes, ratioPercent } from '../../../shared/lib/format';
import type { PreviewBg } from '../../../shared/lib/hasTransparency';
import type { ImageItem } from '../lib/types';
import styles from './ImageCard.module.css';

interface Props {
  item: ImageItem;
  previewBg: PreviewBg;
  onRemove: (id: string) => void;
  onDownload: (item: ImageItem) => void;
  onCompare: (id: string) => void;
}

const FORMAT_META: Record<string, { label: string; className: string }> = {
  png: { label: 'PNG', className: 'formatPng' },
  jpeg: { label: 'JPEG', className: 'formatJpeg' },
  webp: { label: 'WebP', className: 'formatWebp' },
};

function inputFormatKey(type: string): string {
  switch (type) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpeg';
    case 'image/webp':
      return 'webp';
    default:
      return '';
  }
}

const STATUS_TEXT: Record<ImageItem['status'], string> = {
  pending: messages.image.statusPending,
  processing: messages.image.statusProcessing,
  done: messages.image.statusDone,
  error: messages.image.statusError,
  unsupported: '未支持',
};

function noteText(note?: string): string | null {
  switch (note) {
    case 'cannot-reach':
      return messages.image.noteCannotReach;
    case 'metadata-unsupported':
      return messages.image.noteMetadataWebp;
    default:
      return null;
  }
}

export default function ImageCard({ item, previewBg, onRemove, onDownload, onCompare }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [small, setSmall] = useState(false);
  const { result } = item;
  const ratio = result ? ratioPercent(item.originalSize, result.size) : null;
  const growing = result ? result.size > item.originalSize : false;
  const note = noteText(result?.note);
  const formatMeta = FORMAT_META[result ? result.format : inputFormatKey(item.file.type)];

  // 小图/略大于展示区的图：contain 放大居中，不裁切；明显更大的照片类：裁切铺满
  const handleThumbLoad = () => {
    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (wrap && img) {
      const scaleX = img.naturalWidth / wrap.clientWidth;
      const scaleY = img.naturalHeight / wrap.clientHeight;
      setSmall(Math.max(scaleX, scaleY) <= 1.35);
    }
  };

  return (
    <div className={styles.card}>
      <div
        className={`${styles.thumbWrap} ${previewBg === 'checker' ? styles.thumbChecker : styles.thumbWhite}`}
        ref={wrapRef}
      >
        <img
          ref={imgRef}
          className={`${styles.thumb} ${small ? styles.thumbSmall : ''}`}
          src={item.originalUrl}
          alt={item.file.name}
          loading="lazy"
          onLoad={handleThumbLoad}
        />
      </div>
      <div className={styles.info}>
        <div className={styles.name} title={item.file.name}>
          {item.file.name}
        </div>
        <div className={styles.row}>
          <span className={styles.rowLeft}>
            {formatMeta && (
              <span className={`${styles.format} ${styles[formatMeta.className]}`}>{formatMeta.label}</span>
            )}
            <span title={messages.image.original}>{formatBytes(item.originalSize)}</span>
          </span>
          {result && (
            <span className={styles.sizeCompressed} title={messages.image.compressed}>
              {formatBytes(result.size)}
            </span>
          )}
        </div>
        <div className={styles.statusRow}>
          <span className={styles.rowLeft}>
            <span className={`${styles.badge} ${styles[item.status]}`}>{STATUS_TEXT[item.status]}</span>
            {result?.qualityUsed !== undefined && (
              <span className={styles.quality} title={messages.image.qualityUsed}>
                {result.qualityUsed}
              </span>
            )}
          </span>
          {item.status === 'error' || item.status === 'unsupported' ? (
            <span className={styles.errorText}>{item.error}</span>
          ) : (
            result && (
              <span
                className={`${styles.ratioBadge} ${growing ? styles.ratioGrown : styles.ratioSaved}`}
                title={messages.image.ratio}
              >
                {ratio}
              </span>
            )
          )}
        </div>
        {item.status === 'processing' && (
          <div className={styles.miniBar}>
            <div className={styles.miniFill} style={{ width: `${Math.round((item.progress ?? 0) * 100)}%` }} />
          </div>
        )}
        {note && <div className={styles.note}>{note}</div>}
      </div>
      <div className={styles.actions}>
        <button className={styles.action} disabled={!result} onClick={() => onDownload(item)}>
          {messages.image.download}
        </button>
        <button className={styles.action} disabled={!result} onClick={() => result && onCompare(item.id)}>
          {messages.image.compare}
        </button>
        <button className={`${styles.action} ${styles.remove}`} title={messages.image.remove} onClick={() => onRemove(item.id)}>
          ✕
        </button>
      </div>
    </div>
  );
}
