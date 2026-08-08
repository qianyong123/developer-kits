import { messages } from '../../../shared/i18n/zh';
import { CloseIcon, DownloadIcon } from '../../../shared/components/Icons';
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

function formatLabel(format: 'svg' | 'svgz'): string {
  return format === 'svgz' ? 'SVGZ' : 'SVG';
}

export default function SvgCard({ item, previewBg, onRemove, onDownload, onCompare }: Props) {
  const { result } = item;
  const ratio = result ? ratioPercent(item.originalSize, result.size) : null;
  const growing = result ? result.size > item.originalSize : false;
  // 右上角角标展示原始格式；信息行展示压缩后的输出格式
  const inputFormat: 'svg' | 'svgz' = item.file.name.toLowerCase().endsWith('.svgz')
    ? 'svgz'
    : 'svg';
  const outputFormat = result ? result.format : inputFormat;

  return (
    <div className={styles.card}>
      <div
        className={`${styles.thumbWrap} ${previewBg === 'checker' ? styles.thumbChecker : styles.thumbWhite}`}
      >
        {item.originalUrl ? (
          <img className={styles.thumb} src={item.originalUrl} alt={item.file.name} loading="lazy" />
        ) : (
          <div className={styles.thumbPlaceholder}>SVG</div>
        )}
        <span className={styles.previewTag}>{formatLabel(inputFormat)}</span>
      </div>
      <div className={styles.info}>
        <div className={styles.name} title={item.file.name}>
          {item.file.name}
        </div>
        <div className={styles.sizeRow}>
          <span className={styles.sizeLeft}>
            <span className={styles.format}>{formatLabel(outputFormat)}</span>
            <span title={messages.svg.original}>{formatBytes(item.originalSize)}</span>
          </span>
          <span className={styles.sizeCompressed} title={messages.svg.compressed}>
            {result ? formatBytes(result.size) : '--'}
          </span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.statusLeft}>
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
        <button
          className={`${styles.action} ${styles.downloadAction}`}
          disabled={!result}
          onClick={() => onDownload(item)}
        >
          <DownloadIcon size={13} />
          {messages.svg.download}
        </button>
        <button
          className={`${styles.action} ${styles.compareAction}`}
          disabled={!result}
          onClick={() => result && onCompare(item.id)}
        >
          {messages.svg.compare}
        </button>
        <button
          className={`${styles.action} ${styles.remove}`}
          title={messages.svg.remove}
          onClick={() => onRemove(item.id)}
        >
          <CloseIcon size={13} />
        </button>
      </div>
    </div>
  );
}
