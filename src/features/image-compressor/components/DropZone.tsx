import { useRef, useState } from 'react';
import { messages } from '../../../shared/i18n/zh';
import styles from './DropZone.module.css';

interface Props {
  onFiles: (files: File[]) => void;
}

export default function DropZone({ onFiles }: Props) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = () => galleryRef.current?.click();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) onFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  return (
    <div
      className={`${styles.dropzone} ${dragging ? styles.dragging : ''}`}
      onClick={pick}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') pick();
      }}
    >
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={handleChange}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleChange}
      />
      <div className={styles.icon}>🖼️</div>
      <div className={styles.title}>{messages.image.dropTitle}</div>
      <div className={styles.hint}>{messages.image.dropHint}</div>
      <div className={styles.mobileActions}>
        <button
          className={styles.mobileBtn}
          onClick={(e) => {
            e.stopPropagation();
            cameraRef.current?.click();
          }}
        >
          📷 拍照
        </button>
        <button
          className={styles.mobileBtn}
          onClick={(e) => {
            e.stopPropagation();
            galleryRef.current?.click();
          }}
        >
          🖼️ 从相册选择
        </button>
      </div>
    </div>
  );
}
