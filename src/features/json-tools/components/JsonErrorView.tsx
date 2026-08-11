import { messages } from '@/shared/i18n/zh';
import { errorContext, type JsonError } from '@/features/json-tools/lib/json';
import styles from '@/features/json-tools/JsonToolsPage.module.css';

interface Props {
  error: JsonError;
  side?: 'before' | 'after';
  text: string;
  title: string;
}

/** 错误详情视图：错误位置、上下文与行内定位标记。 */
export default function JsonErrorView({ error, side, text, title }: Props) {
  const ctx = errorContext(text, error);
  return (
    <div className={styles.errorBox}>
      <strong>{title}</strong>
      {side && (
        <span className={styles.errorSide}>
          {side === 'before' ? messages.json.beforeLabel : messages.json.afterLabel}
        </span>
      )}
      {error.line !== undefined && error.column !== undefined && (
        <span className={styles.errorPos}>{messages.json.errorLineCol(error.line, error.column)}</span>
      )}
      <p className={styles.errorMessage}>{error.message}</p>
      {ctx && (
        <div className={styles.errorContext}>
          <code className={styles.errorCode}>
            {ctx.hasBefore && <span className={styles.errorEllipsis}>…</span>}
            {ctx.before}
            <mark className={styles.errorMark}>{ctx.after[0] ?? ''}</mark>
            {ctx.after.slice(1)}
            {ctx.hasAfter && <span className={styles.errorEllipsis}>…</span>}
          </code>
          <div className={styles.errorCaretRow}>
            <span
              className={styles.errorCaret}
              style={{
                marginLeft: `${(ctx.before.length + (ctx.hasBefore ? 1 : 0)) * 0.62}em`,
              }}
            >
              ↑
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
