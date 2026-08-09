import styles from './Notice.module.css';

interface NoticeProps {
  text: string;
  onClose: () => void;
}

export default function Notice({ text, onClose }: NoticeProps) {
  return (
    <div className={styles.notice} role="status">
      <span>{text}</span>
      <button className={styles.noticeClose} onClick={onClose} aria-label="关闭提示">
        ✕
      </button>
    </div>
  );
}
