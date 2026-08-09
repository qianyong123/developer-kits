import { useRef, useState } from 'react';
import { UploadIcon } from '@/shared/components/Icons';
import styles from '@/shared/components/FileDropZone/FileDropZone.module.css';

interface PickType {
  description: string;
  accept: Record<string, string[]>;
}

interface WindowWithPicker extends Window {
  showOpenFilePicker?: (options: {
    multiple?: boolean;
    types?: PickType[];
    excludeAcceptAllOption?: boolean;
  }) => Promise<FileSystemFileHandle[]>;
}

interface Props {
  accept: string;
  pickTypes: PickType[];
  dragTitle: string;
  tapTitle: string;
  hint: string;
  features?: string[];
  /** 拖拽时的文件过滤；不传则全部接收。 */
  filter?: (files: File[]) => File[];
  onFiles: (files: File[]) => void;
}

export default function FileDropZone({
  accept,
  pickTypes,
  dragTitle,
  tapTitle,
  hint,
  features,
  filter,
  onFiles,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = async () => {
    const picker = (window as WindowWithPicker).showOpenFilePicker;
    if (typeof picker === 'function') {
      try {
        const handles = await picker({
          multiple: true,
          types: pickTypes,
          excludeAcceptAllOption: true,
        });
        const files = await Promise.all(handles.map((h) => h.getFile()));
        onFiles(files);
        return;
      } catch (err) {
        // 用户取消（AbortError）或 API 异常时静默回退
        if ((err as Error).name !== 'AbortError') {
          console.error('showOpenFilePicker failed', err);
        }
        return;
      }
    }
    inputRef.current?.click();
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
        const files = Array.from(e.dataTransfer.files);
        onFiles(filter ? filter(files) : files);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') pick();
      }}
    >
      <input
        ref={inputRef}
        type="file"
        title=""
        accept={accept}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
      <div className={styles.icon}>
        <UploadIcon size={26} />
      </div>
      <div className={styles.title}>
        <span className={styles.dragText}>{dragTitle}</span>
        <span className={styles.tapText}>{tapTitle}</span>
      </div>
      <div className={styles.hint}>{hint}</div>
      {features && features.length > 0 && (
        <div className={styles.features}>
          {features.map((feature) => (
            <span key={feature} className={styles.feature}>
              <span className={styles.dot} />
              {feature}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
