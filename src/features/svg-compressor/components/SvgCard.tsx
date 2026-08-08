import { messages } from '../../../shared/i18n/zh';
import { formatBytes, ratioPercent } from '../../../shared/lib/format';
import type { PreviewBg } from '../../../shared/lib/hasTransparency';
import type { SvgItem } from '../lib/types';
import styles from './SvgCard.module.css';

interface Props {
  item: SvgItem;
  previewBg: PreviewBg;
  onRemove: (id: string) => void;
  onDownload: (item: SvgItem) => void;
  onCompare: (id: string) => void;
}

const STATUS_TEXT: Record<SvgItem['status'], string> = {
  pending: messages.svg.statusPending,
  processing: messages.svg.statusProcessing,
  done: messages.svg.statusDone,
  error: messages.svg.statusError,
};

export default function SvgCard({ item, previewBg, onRemove, onDownload, onCompare }: Props) {
  const { result } = item;
  const ratio = result ? ratioPercent(item.originalSize, result.size) : null;
  const growing = result ? result.size > item.originalSize : false;
  const formatLabel = result
    ? result.format === 'svgz'
      ? 'SVGZ'
      : 'SVG'
    : item.file.name.toLowerCase().endsWith('.svgz')
      ? 'SVGZ'
      : 'SVG';

  return (
    <div className={styles.card}>
      <div
        className={`${styles.thumbWrap} ${previewBg === 'checker' ? styles.thumbChecker : styles.thumbWhite}`}
      >
        {item.originalUrl ? (
          <img className={styles.thumb} src={item.originalUrl} alt={item.file.name} loading="lazy" />
        ) : (
          <div className={styles.thumbPlaceholder}>📐</div>
        )}
      </div>
      <div className={styles.info}>
        <div className={styles.name} title={item.file.name}>
          {item.file.name}
        </div>
        <div className={styles.row}>
          <span className={styles.rowLeft}>
            <span className={styles.format}>{formatLabel}</span>
            <span title={messages.svg.original}>{formatBytes(item.originalSize)}</span>
          </span>
          {result && (
            <span className={styles.sizeCompressed} title={messages.svg.compressed}>
              {formatBytes(result.size)}
            </span>
          )}
        </div>
        <div className={styles.statusRow}>
          <span className={styles.rowLeft}>
            <span className={`${styles.badge} ${styles[item.status]}`}>{STATUS_TEXT[item.status]}</span>
          </span>
          {item.status === 'error' ? (
            <span className={styles.errorText}>{item.error}</span>
          ) : (
            result && (
              <span
                className={`${styles.ratioBadge} ${growing ? styles.ratioGrown : styles.ratioSaved}`}
                title={messages.svg.ratio}
              >
                {ratio}
              </span>
            )
          )}
        </div>
        {result?.note === 'kept-original' && <div className={styles.note}>{messages.svg.noteKeptOriginal}</div>}
      </div>
      <div className={styles.actions}>
        <button className={styles.action} disabled={!result} onClick={() => onDownload(item)}>
          {messages.svg.download}
        </button>
        <button className={styles.action} disabled={!result} onClick={() => result && onCompare(item.id)}>
          {messages.svg.compare}
        </button>
        <button
          className={`${styles.action} ${styles.remove}`}
          title={messages.svg.remove}
          onClick={() => onRemove(item.id)}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
