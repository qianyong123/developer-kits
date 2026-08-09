import { useCallback, useMemo, useRef, useState } from 'react';
import { messages } from '@/shared/i18n/zh';
import { DownloadIcon } from '@/shared/components/Icons';
import Notice from '@/shared/components/Notice/Notice';
import { useDebouncedEffect } from '@/shared/hooks/useDebounced';
import { usePersistedState } from '@/shared/hooks/usePersistedState';
import { downloadUrl } from '@/shared/lib/download';
import {
  diffJson,
  formatDiffReport,
  formatJson,
  minifyJson,
  parseJson,
  shortValue,
  validateJson,
  type DuplicateKeyInfo,
  type JsonChange,
  type JsonError,
} from '@/features/json-tools/lib/json';
import styles from '@/features/json-tools/JsonToolsPage.module.css';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

type JsonMode = 'format' | 'minify' | 'validate' | 'diff';

type OutputState =
  | { kind: 'idle' }
  | { kind: 'error'; error: JsonError; side?: 'before' | 'after' }
  | { kind: 'text'; text: string }
  | { kind: 'valid'; duplicates: DuplicateKeyInfo[] }
  | { kind: 'diff'; changes: JsonChange[] };

const MODES: Array<{ id: JsonMode; label: string }> = [
  { id: 'format', label: messages.json.modeFormat },
  { id: 'minify', label: messages.json.modeMinify },
  { id: 'validate', label: messages.json.modeValidate },
  { id: 'diff', label: messages.json.modeDiff },
];

const SAMPLE = JSON.stringify(
  {
    name: '开发工具包',
    version: '0.1.0',
    tools: ['图片压缩', 'SVG 压缩', 'JSON 工具'],
    stats: { downloads: 1234, rating: 4.8, active: true },
    config: { theme: 'light', language: 'zh-CN' },
  },
  null,
  2,
);

const SAMPLE_BEFORE = JSON.stringify(
  {
    name: '开发工具包',
    version: '0.1.0',
    tools: ['图片压缩', 'SVG 压缩'],
    stats: { downloads: 1000, rating: 4.5, active: true },
  },
  null,
  2,
);

const SAMPLE_AFTER = JSON.stringify(
  {
    name: '开发工具包',
    version: '0.2.0',
    tools: ['图片压缩', 'SVG 压缩', 'JSON 工具'],
    stats: { downloads: 1234, rating: 4.8, active: false },
    config: { theme: 'light' },
  },
  null,
  2,
);

export default function JsonToolsPage() {
  const [mode, setMode] = useState<JsonMode>('format');
  const [indent, setIndent] = usePersistedState<number>('devkits.json.indent', 2);
  const [sortKeys, setSortKeys] = useState(false);
  const [input, setInput] = useState('');
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [output, setOutput] = useState<OutputState>({ kind: 'idle' });
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const run = useCallback(() => {
    if (mode === 'diff') {
      if (before.trim() === '' && after.trim() === '') {
        setOutput({ kind: 'idle' });
        return;
      }
      const parsedBefore = parseJson(before);
      const parsedAfter = parseJson(after);
      if (!parsedBefore.ok) {
        setOutput({ kind: 'error', error: parsedBefore.error, side: 'before' });
        return;
      }
      if (!parsedAfter.ok) {
        setOutput({ kind: 'error', error: parsedAfter.error, side: 'after' });
        return;
      }
      setOutput({ kind: 'diff', changes: diffJson(parsedBefore.value, parsedAfter.value) });
      return;
    }

    if (input.trim() === '') {
      setOutput({ kind: 'idle' });
      return;
    }

    if (mode === 'validate') {
      const result = validateJson(input);
      if (!result.ok) {
        setOutput({ kind: 'error', error: result.error! });
        return;
      }
      setOutput({ kind: 'valid', duplicates: result.duplicates ?? [] });
      return;
    }

    const result =
      mode === 'format' ? formatJson(input, indent, sortKeys) : minifyJson(input);
    if (!result.ok) {
      setOutput({ kind: 'error', error: result.error });
      return;
    }
    setOutput({ kind: 'text', text: result.text });
  }, [mode, input, before, after, indent, sortKeys]);

  useDebouncedEffect(
    () => {
      run();
    },
    [mode, input, before, after, indent, sortKeys],
    250,
  );

  const handleFile = useCallback(
    (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        setNotice(messages.json.fileTooLarge);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? '');
        if (mode === 'diff') setBefore(text);
        else setInput(text);
      };
      reader.readAsText(file);
    },
    [mode],
  );

  const loadSample = useCallback(() => {
    if (mode === 'diff') {
      setBefore(SAMPLE_BEFORE);
      setAfter(SAMPLE_AFTER);
    } else {
      setInput(SAMPLE);
    }
  }, [mode]);

  const clearAll = useCallback(() => {
    setInput('');
    setBefore('');
    setAfter('');
    setOutput({ kind: 'idle' });
    setNotice(null);
  }, []);

  const reportText = useMemo(() => {
    switch (output.kind) {
      case 'text':
        return output.text;
      case 'valid':
        return output.duplicates.length > 0
          ? `${messages.json.warningsTitle}\n${output.duplicates
              .map((d) => messages.json.duplicateKey(d.key, d.firstLine, d.secondLine))
              .join('\n')}`
          : messages.json.valid;
      case 'diff':
        return formatDiffReport(output.changes);
      default:
        return '';
    }
  }, [output]);

  const copyOutput = useCallback(async () => {
    if (!reportText) return;
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时静默
    }
  }, [reportText]);

  const downloadOutput = useCallback(() => {
    if (!reportText) return;
    const blob = new Blob([reportText], {
      type: mode === 'diff' || mode === 'validate' ? 'text/plain;charset=utf-8' : 'application/json',
    });
    const url = URL.createObjectURL(blob);
    downloadUrl(url, messages.json.downloadName[mode]);
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }, [reportText, mode]);

  const errorView = (error: JsonError, side?: 'before' | 'after') => (
    <div className={styles.errorBox}>
      <strong>{messages.json.invalid}</strong>
      {side && <span className={styles.errorSide}>{side === 'before' ? messages.json.beforeLabel : messages.json.afterLabel}</span>}
      {error.line !== undefined && error.column !== undefined && (
        <span className={styles.errorPos}>{messages.json.errorLineCol(error.line, error.column)}</span>
      )}
      <p className={styles.errorMessage}>{error.message}</p>
    </div>
  );

  const renderOutput = () => {
    switch (output.kind) {
      case 'idle':
        return <div className={styles.placeholder}>{messages.json.outputPlaceholder}</div>;
      case 'error':
        return errorView(output.error, output.side);
      case 'text':
        return (
          <>
            <pre className={styles.outputText}>{output.text}</pre>
            <div className={styles.outputMeta}>
              {messages.json.sizeLabel}: {output.text.length} B · {messages.json.linesLabel}:{' '}
              {output.text.split('\n').length}
            </div>
          </>
        );
      case 'valid':
        return (
          <div className={styles.validBox}>
            <strong className={styles.validTitle}>✓ {messages.json.valid}</strong>
            {output.duplicates.length > 0 && (
              <div className={styles.warnings}>
                <strong>{messages.json.warningsTitle}</strong>
                {output.duplicates.map((d, i) => (
                  <p key={i}>{messages.json.duplicateKey(d.key, d.firstLine, d.secondLine)}</p>
                ))}
              </div>
            )}
          </div>
        );
      case 'diff':
        return (
          <div className={styles.diffBox}>
            {output.changes.length === 0 ? (
              <div className={styles.diffNone}>{messages.json.diffNone}</div>
            ) : (
              <>
                <div className={styles.diffSummary}>
                  {messages.json.diffSummary(
                    output.changes.filter((c) => c.type === 'added').length,
                    output.changes.filter((c) => c.type === 'removed').length,
                    output.changes.filter((c) => c.type === 'changed').length,
                  )}
                </div>
                <div className={styles.changeList}>
                  {output.changes.map((change, i) => (
                    <div key={i} className={styles.changeRow}>
                      <span className={`${styles.changeBadge} ${styles[change.type]}`}>
                        {change.type === 'added'
                          ? messages.json.changeAdded
                          : change.type === 'removed'
                            ? messages.json.changeRemoved
                            : messages.json.changeChanged}
                      </span>
                      <code className={styles.changePath}>{change.path}</code>
                      {change.type === 'added' && (
                        <span className={styles.changeValue}>{shortValue(change.after, 60)}</span>
                      )}
                      {change.type === 'removed' && (
                        <span className={styles.changeValue}>{shortValue(change.before, 60)}</span>
                      )}
                      {change.type === 'changed' && (
                        <span className={styles.changeValue}>
                          {shortValue(change.before, 60)} → {shortValue(change.after, 60)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.headerLeft}>
            <h1>{messages.json.title}</h1>
            <p className={styles.subtitle}>{messages.json.subtitle}</p>
          </div>
          <div className={styles.toolbar}>
            <button className="btn" onClick={() => fileInputRef.current?.click()}>
              {messages.json.importFile}
            </button>
            <button className="btn" onClick={loadSample}>
              {messages.json.loadSample}
            </button>
            <button className="btn" disabled={!reportText} onClick={() => void copyOutput()}>
              {copied ? messages.json.copied : messages.json.copy}
            </button>
            <button className="btn" disabled={!reportText} onClick={downloadOutput}>
              <DownloadIcon size={14} />
              {messages.json.download}
            </button>
            <button className="btn btn-ghost-danger" onClick={clearAll}>
              {messages.json.clear}
            </button>
          </div>
        </div>

        {notice && <Notice text={notice} onClose={() => setNotice(null)} />}

        <div className={styles.modes}>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={m.id === mode ? styles.modeActive : styles.mode}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'format' && (
          <div className={styles.options}>
            <span className={styles.optionLabel}>{messages.json.indent}</span>
            {[2, 4].map((n) => (
              <button
                key={n}
                type="button"
                className={n === indent ? styles.segmentActive : styles.segment}
                onClick={() => setIndent(n)}
              >
                {n}
              </button>
            ))}
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={sortKeys}
                onChange={(e) => setSortKeys(e.target.checked)}
              />
              {messages.json.sortKeys}
            </label>
          </div>
        )}
      </header>

      <div className={styles.columns}>
        {mode === 'diff' ? (
          <>
            <div className={styles.editor}>
              <div className={styles.editorLabel}>{messages.json.beforeLabel}</div>
              <textarea
                className={styles.textarea}
                value={before}
                onChange={(e) => setBefore(e.target.value)}
                placeholder={messages.json.beforePlaceholder}
                spellCheck={false}
              />
            </div>
            <div className={styles.editor}>
              <div className={styles.editorLabel}>{messages.json.afterLabel}</div>
              <textarea
                className={styles.textarea}
                value={after}
                onChange={(e) => setAfter(e.target.value)}
                placeholder={messages.json.afterPlaceholder}
                spellCheck={false}
              />
            </div>
            <div className={styles.diffResult}>{renderOutput()}</div>
          </>
        ) : (
          <>
            <div className={styles.editor}>
              <div className={styles.editorLabel}>{messages.json.inputLabel}</div>
              <textarea
                className={styles.textarea}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={messages.json.inputPlaceholder}
                spellCheck={false}
              />
            </div>
            <div className={styles.output}>{renderOutput()}</div>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
