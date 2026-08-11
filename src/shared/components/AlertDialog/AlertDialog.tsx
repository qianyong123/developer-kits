import { useEffect } from 'react';
import { Button } from '@/shared/components/Button/Button';
import styles from '@/shared/components/AlertDialog/AlertDialog.module.css';

interface AlertDialogProps {
  title: string;
  message: string;
  confirmText: string;
  onClose: () => void;
}

/** 轻量提示弹框：单确认按钮，Esc / 点击遮罩 / 确认按钮均可关闭。 */
export default function AlertDialog({
  title,
  message,
  confirmText,
  onClose,
}: AlertDialogProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <strong className={styles.title}>{title}</strong>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <Button variant="primary" autoFocus onClick={onClose}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
