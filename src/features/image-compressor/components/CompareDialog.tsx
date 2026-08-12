import { messages } from '@/shared/i18n/zh';
import { formatBytes } from '@/shared/lib/format';
import type { PreviewBg } from '@/shared/lib/hasTransparency';
import SwitchCompare from '@/shared/components/SwitchCompare/SwitchCompare';
import type { ImageItem } from '@/features/image-compressor/lib/types';
import styles from '@/features/image-compressor/components/CompareDialog.module.css';

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

        <SwitchCompare
          before={item.originalUrl}
          after={item.result.url}
          beforeLabel={messages.image.original}
          afterLabel={messages.image.compressed}
          beforeSize={formatBytes(item.originalSize)}
          afterSize={formatBytes(item.result.size)}
          beforeBytes={item.originalSize}
          afterBytes={item.result.size}
          background={previewBg}
        />
      </div>
    </div>
  );
}
