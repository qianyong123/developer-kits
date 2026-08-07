import { useRef, useState } from 'react';
import { messages } from '../../../shared/i18n/zh';
import styles from './DropZone.module.css';

interface Props {
  onFiles: (files: File[]) => void;
}

interface PickFileType {
  description: string;
  accept: Record<string, string[]>;
}

interface WindowWithPicker extends Window {
  showOpenFilePicker?: (options: {
    multiple?: boolean;
    types?: PickFileType[];
    excludeAcceptAllOption?: boolean;
  }) => Promise<FileSystemFileHandle[]>;
}

const PICK_TYPES: PickFileType[] = [
  {
    description: '图片',
    accept: {
      'image/*': [
        '.jpg',
        '.jpeg',
        '.png',
        '.webp',
        '.gif',
        '.bmp',
        '.svg',
        '.avif',
        '.ico',
        '.tiff',
        '.heic',
        '.heif',
      ],
    },
  },
];

export default function DropZone({ onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = async () => {
    const picker = (window as WindowWithPicker).showOpenFilePicker;
    if (typeof picker === 'function') {
      try {
        const handles = await picker({
          multiple: true,
          types: PICK_TYPES,
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
        // 只接收图片文件，过滤掉文档/视频等非图片
        const imgs = Array.from(e.dataTransfer.files).filter((f) =>
          f.type.startsWith('image/'),
        );
        onFiles(imgs);
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
        accept=".jpg, .jpeg, .png, .webp, .gif, .bmp, .svg, .avif, .ico, .tiff, .heic, .heif"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
      <div className={styles.icon}>🖼️</div>
      <div className={styles.title}>
        <span className={styles.dragText}>{messages.image.dropTitle}</span>
        <span className={styles.tapText}>{messages.image.tapTitle}</span>
      </div>
      <div className={styles.hint}>{messages.image.dropHint}</div>
    </div>
  );
}
