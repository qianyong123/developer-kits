import { useState } from 'react';
import { messages } from '@/shared/i18n/zh';
import SideBySideCompare from '@/shared/components/SideBySideCompare/SideBySideCompare';
import { formatBytes } from '@/shared/lib/format';
import type { PreviewBg } from '@/shared/lib/hasTransparency';
import type { SvgItem } from '@/features/svg-compressor/lib/types';
import styles from '@/features/svg-compressor/components/SvgCompareDialog.module.css';

type Tab = 'visual' | 'code';

export default function SvgCompareDialog({
  item,
  onClose,
  previewBg,
}: {
  item: SvgItem;
  onClose: () => void;
  previewBg: PreviewBg;
}) {
  const [tab, setTab] = useState<Tab>('visual');
  const [copied, setCopied] = useState(false);
  const { result } = item;
  if (!result) return null;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时静默失败
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>
          <strong>{messages.svg.compareTitle}</strong>
          <button className={styles.close} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.tabs}>
          <button
            type="button"
            className={tab === 'visual' ? styles.tabActive : styles.tab}
            onClick={() => setTab('visual')}
          >
            {messages.svg.compareVisual}
          </button>
          <button
            type="button"
            className={tab === 'code' ? styles.tabActive : styles.tab}
            onClick={() => setTab('code')}
          >
            {messages.svg.compareCode}
          </button>
        </div>

        {tab === 'visual' ? (
          <SideBySideCompare
            before={item.originalUrl}
            after={result.previewUrl}
            beforeLabel={messages.svg.original}
            afterLabel={messages.svg.compressed}
            beforeSize={formatBytes(item.originalSize)}
            afterSize={formatBytes(result.size)}
            background={previewBg}
          />
        ) : (
          <div className={styles.codeBlock}>
            <div className={styles.codeToolbar}>
              <span className={styles.codeMeta}>
                {formatBytes(result.code.length)} · {messages.svg.formatSvg}
              </span>
              <button className={styles.copyBtn} onClick={() => void copyCode()}>
                {copied ? messages.svg.copied : messages.svg.copy}
              </button>
            </div>
            <pre className={styles.code}>{result.code}</pre>
          </div>
        )}

      </div>
    </div>
  );
}
