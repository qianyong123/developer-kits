import { messages } from '@/shared/i18n/zh';
import type { BigNumberInfo, DuplicateKeyInfo } from '@/features/json-tools/lib/json';
import styles from '@/features/json-tools/JsonToolsPage.module.css';

interface Props {
  duplicates: DuplicateKeyInfo[];
  bigNumbers: BigNumberInfo[];
}

/** 校验通过视图：合法性提示、大数与重复键警告。 */
export default function JsonValidView({ duplicates, bigNumbers }: Props) {
  return (
    <div className={styles.validBox}>
      <strong className={styles.validTitle}>✓ {messages.json.valid}</strong>
      {bigNumbers.length > 0 && (
        <div className={styles.warnings}>
          {messages.json.bigNumberWarning(bigNumbers.length)}
        </div>
      )}
      {duplicates.length > 0 && (
        <div className={styles.warnings}>
          <strong>{messages.json.warningsTitle}</strong>
          {duplicates.map((d, i) => (
            <p key={i}>{messages.json.duplicateKey(d.key, d.firstLine, d.secondLine)}</p>
          ))}
        </div>
      )}
    </div>
  );
}
