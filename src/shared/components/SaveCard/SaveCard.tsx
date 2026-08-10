import styles from './SaveCard.module.css';

interface SaveCardProps {
  label: string;
  savedValue: string;
  ratio: string;
  /** 节省比例 0-100，用于进度条 */
  percent: number;
  meta: string;
}

/** 预计节省卡片：节省体积 + 压缩率 + 进度条 + 明细。图片与 SVG 设置面板共用。 */
export default function SaveCard({ label, savedValue, ratio, percent, meta }: SaveCardProps) {
  return (
    <div className={styles.saveCard}>
      <div className={styles.saveHeader}>
        <span className={styles.saveLabel}>{label}</span>
        <strong className={styles.saveValue}>{savedValue}</strong>
        <strong className={styles.saveRatio}>{ratio}</strong>
      </div>
      <div className={styles.saveBar}>
        <div className={styles.saveFill} style={{ width: `${percent}%` }} />
      </div>
      <div className={styles.saveMeta}>{meta}</div>
    </div>
  );
}
