import { messages } from '../../../shared/i18n/zh';
import { formatBytes } from '../../../shared/lib/format';
import type { PreviewBg } from '../../../shared/lib/hasTransparency';
import SliderCompare from '../../../shared/components/SliderCompare/SliderCompare';
import type { ImageItem } from '../lib/types';
import styles from './CompareDialog.module.css';

export default function CompareDialog({
  item,
  onClose,
  previewBg,
}: {
  item: ImageItem;
  onClose: () => void;
  previewBg: PreviewBg;
}) {
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

        <SliderCompare
          before={item.originalUrl}
          after={item.result.url}
          beforeLabel={messages.image.original}
          afterLabel={messages.image.compressed}
          ariaLabel={messages.image.compareSlide}
          background={previewBg}
        />

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
