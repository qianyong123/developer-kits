import { useEffect, useRef, useState } from 'react';
import styles from '@/features/json-tools/JsonToolsPage.module.css';

const EDITOR_PADDING_TOP = 12;
const EDITOR_LINE_HEIGHT = 20.8; // 13px * 1.6，与 CSS 保持一致

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  highlightLine?: number | null;
}

/** 带错误行高亮与自动滚动的 JSON 编辑器。 */
export default function JsonEditor({ value, onChange, placeholder, highlightLine }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // 出错时滚动到对应行
  useEffect(() => {
    if (highlightLine == null || !ref.current) return;
    ref.current.scrollTop = Math.max(0, (highlightLine - 1) * EDITOR_LINE_HEIGHT - 40);
  }, [highlightLine]);

  const highlightTop =
    highlightLine == null
      ? null
      : EDITOR_PADDING_TOP + (highlightLine - 1) * EDITOR_LINE_HEIGHT - scrollTop;

  return (
    <div className={styles.editorBody}>
      {highlightTop !== null && <div className={styles.errorLine} style={{ top: highlightTop }} />}
      <textarea
        ref={ref}
        className={styles.textarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        placeholder={placeholder}
        spellCheck={false}
      />
    </div>
  );
}
