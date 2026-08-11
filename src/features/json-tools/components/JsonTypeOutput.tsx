import { JsonView, defaultStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import { messages } from '@/shared/i18n/zh';
import { Button } from '@/shared/components/Button/Button';
import type { JsonMode, OutputState, ProcessAction } from '@/features/json-tools/types';
import styles from '@/features/json-tools/JsonToolsPage.module.css';

interface Props {
  output: Extract<OutputState, { kind: 'text' }>;
  mode: JsonMode;
  action: ProcessAction;
  onCopy: () => void;
}

/** 文本类输出视图：大数警告、JSON 树/纯文本与元信息。 */
export default function JsonTypeOutput({ output, mode, action, onCopy }: Props) {
  return (
    <>
      {output.bigNumbers.length > 0 && (
        <div className={styles.warnings}>
          {messages.json.bigNumberWarning(output.bigNumbers.length)}
        </div>
      )}
      {mode === 'process' &&
      action === 'format' &&
      output.value !== null &&
      typeof output.value === 'object' ? (
        <div className={styles.jsonViewer}>
          <JsonView
            data={output.value as object}
            style={defaultStyles}
            shouldExpandNode={(level) => level < 2}
          />
        </div>
      ) : (
        <pre className={styles.outputText}>{output.text}</pre>
      )}
      <div className={styles.outputMeta}>
        <span>
          {messages.json.sizeLabel}: {output.text.length} B · {messages.json.linesLabel}:{' '}
          {output.text.split('\n').length}
        </span>
        {mode === 'type' && (
          <Button variant="primary" size="sm" onClick={onCopy}>
            {messages.json.copy}
          </Button>
        )}
      </div>
    </>
  );
}
