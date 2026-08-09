import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  percent: number;
  done: number;
  total: number;
  processedLabel: string;
  ofLabel: string;
}

export default function ProgressBar({
  percent,
  done,
  total,
  processedLabel,
  ofLabel,
}: ProgressBarProps) {
  return (
    <div className={styles.progressBar}>
      <div className={styles.progressFill} style={{ width: `${percent}%` }} />
      <span>
        {processedLabel} {done} {ofLabel} {total} · {percent}%
      </span>
    </div>
  );
}
