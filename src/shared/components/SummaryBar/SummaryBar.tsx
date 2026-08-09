import styles from './SummaryBar.module.css';

interface SummaryBarProps {
  summaryLabel: string;
  count: number;
  countUnit: string;
  originalLabel: string;
  originalValue: string;
  compressedLabel: string;
  compressedValue: string;
  ratioLabel: string;
  ratioValue: string;
  bad: boolean;
  /** 附加信息（如“ · 1 张不支持”），可选 */
  extra?: string;
}

export default function SummaryBar({
  summaryLabel,
  count,
  countUnit,
  originalLabel,
  originalValue,
  compressedLabel,
  compressedValue,
  ratioLabel,
  ratioValue,
  bad,
  extra,
}: SummaryBarProps) {
  return (
    <div className={styles.summary}>
      <span>
        {summaryLabel} {count} {countUnit} · {originalLabel}: <b>{originalValue}</b> ·{' '}
        {compressedLabel}: <b>{compressedValue}</b> · {ratioLabel}:{' '}
        <b className={bad ? styles.bad : styles.good}>{ratioValue}</b>
        {extra && <span className={styles.extra}>{extra}</span>}
      </span>
    </div>
  );
}
