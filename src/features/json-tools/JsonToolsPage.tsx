import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { messages } from '@/shared/i18n/zh';
import { DownloadIcon } from '@/shared/components/Icons';
import HelpTip from '@/shared/components/HelpTip/HelpTip';
import Notice from '@/shared/components/Notice/Notice';
import { useDebouncedEffect } from '@/shared/hooks/useDebounced';
import { downloadUrl } from '@/shared/lib/download';
import { copyText } from '@/shared/lib/clipboard';
import { JsonView, defaultStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import {
  diffJson,
  formatDiffReport,
  formatJson,
  jsonToTsTypes,
  minifyJson,
  parseJson,
  shortValue,
  unwrapJsonString,
  validateJson,
  type BigNumberInfo,
  type DuplicateKeyInfo,
  type JsonChange,
  type JsonError,
} from '@/features/json-tools/lib/json';
import { useJsonToolsStore } from '@/features/json-tools/store';
import styles from '@/features/json-tools/JsonToolsPage.module.css';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const EDITOR_PADDING_TOP = 12;
const EDITOR_LINE_HEIGHT = 20.8; // 13px * 1.6，与 CSS 保持一致

type JsonMode = 'format' | 'minify' | 'validate' | 'diff' | 'type';

type OutputState =
  | { kind: 'idle' }
  | { kind: 'error'; error: JsonError; side?: 'before' | 'after' }
  | { kind: 'text'; text: string; value: unknown; bigNumbers: BigNumberInfo[] }
  | { kind: 'valid'; duplicates: DuplicateKeyInfo[]; bigNumbers: BigNumberInfo[] }
  | { kind: 'diff'; changes: JsonChange[] };

/** 带错误行高亮与自动滚动的 JSON 编辑器。 */
function JsonEditor({
  value,
  onChange,
  placeholder,
  highlightLine,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  highlightLine?: number | null;
}) {
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

const MODES: Array<{ id: JsonMode; label: string }> = [
  { id: 'format', label: messages.json.modeFormat },
  { id: 'minify', label: messages.json.modeMinify },
  { id: 'validate', label: messages.json.modeValidate },
  { id: 'diff', label: messages.json.modeDiff },
  { id: 'type', label: messages.json.modeType },
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
  const input = useJsonToolsStore((s) => s.input);
  const setInput = useJsonToolsStore((s) => s.setInput);
  const before = useJsonToolsStore((s) => s.before);
  const setBefore = useJsonToolsStore((s) => s.setBefore);
  const after = useJsonToolsStore((s) => s.after);
  const setAfter = useJsonToolsStore((s) => s.setAfter);
  const indent = useJsonToolsStore((s) => s.indent);
  const setIndent = useJsonToolsStore((s) => s.setIndent);
  const sortKeys = useJsonToolsStore((s) => s.sortKeys);
  const setSortKeys = useJsonToolsStore((s) => s.setSortKeys);
  const unwrap = useJsonToolsStore((s) => s.unwrap);
  const setUnwrap = useJsonToolsStore((s) => s.setUnwrap);
  const lenient = useJsonToolsStore((s) => s.lenient);
  const setLenient = useJsonToolsStore((s) => s.setLenient);
  const clearData = useJsonToolsStore((s) => s.clearData);
  const [output, setOutput] = useState<OutputState>({ kind: 'idle' });
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runDiff = useCallback(() => {
    if (before.trim() === '' && after.trim() === '') {
      setOutput({ kind: 'idle' });
      return;
    }
    const parsedBefore = parseJson(before, { lenient });
    const parsedAfter = parseJson(after, { lenient });
    if (!parsedBefore.ok) {
      setOutput({ kind: 'error', error: parsedBefore.error, side: 'before' });
      return;
    }
    if (!parsedAfter.ok) {
      setOutput({ kind: 'error', error: parsedAfter.error, side: 'after' });
      return;
    }
    const beforeValue = unwrap ? unwrapJsonString(parsedBefore.value, lenient) : parsedBefore.value;
    const afterValue = unwrap ? unwrapJsonString(parsedAfter.value, lenient) : parsedAfter.value;
    setOutput({ kind: 'diff', changes: diffJson(beforeValue, afterValue) });
  }, [before, after, unwrap, lenient]);

  const run = useCallback(() => {
    if (input.trim() === '') {
      setOutput({ kind: 'idle' });
      return;
    }

    if (mode === 'validate') {
      const result = validateJson(input, { unwrapString: unwrap, lenient });
      if (!result.ok) {
        setOutput({ kind: 'error', error: result.error! });
        return;
      }
      setOutput({
        kind: 'valid',
        duplicates: result.duplicates ?? [],
        bigNumbers: result.bigNumbers ?? [],
      });
      return;
    }

    if (mode === 'type') {
      const parsed = parseJson(input, { lenient });
      if (!parsed.ok) {
        setOutput({ kind: 'error', error: parsed.error });
        return;
      }
      const value = unwrap ? unwrapJsonString(parsed.value, lenient) : parsed.value;
      setOutput({ kind: 'text', text: jsonToTsTypes(value), value, bigNumbers: [] });
      return;
    }

    const result =
      mode === 'format'
        ? formatJson(input, { indent, sortKeys, unwrapString: unwrap, lenient })
        : minifyJson(input, { unwrapString: unwrap, lenient });
    if (!result.ok) {
      setOutput({ kind: 'error', error: result.error });
      return;
    }
    setOutput({
      kind: 'text',
      text: result.text,
      value: result.value,
      bigNumbers: result.bigNumbers,
    });
  }, [mode, input, indent, sortKeys, unwrap, lenient]);

  // 格式化/压缩/校验自动处理；对比模式改为点击“开始对比”手动触发
  useDebouncedEffect(
    () => {
      if (mode !== 'diff') run();
    },
    [mode, input, indent, sortKeys, unwrap, lenient],
    250,
  );

  // 快捷键：Ctrl/Cmd + Enter 立即处理
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (mode === 'diff') runDiff();
        else run();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, run, runDiff]);

  // 进入对比模式时清空旧输出，等待手动触发
  useEffect(() => {
    if (mode === 'diff') setOutput({ kind: 'idle' });
  }, [mode]);

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
    [mode, setBefore, setInput],
  );

  const loadSample = useCallback(() => {
    if (mode === 'diff') {
      setBefore(SAMPLE_BEFORE);
      setAfter(SAMPLE_AFTER);
    } else {
      setInput(SAMPLE);
    }
  }, [mode, setBefore, setAfter, setInput]);

  const clearAll = useCallback(() => {
    clearData();
    setOutput({ kind: 'idle' });
    setNotice(null);
  }, [clearData]);

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
    if (await copyText(reportText)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      setNotice(messages.json.copyFailed);
    }
  }, [reportText]);

  const downloadOutput = useCallback(() => {
    if (!reportText) return;
    const blob = new Blob([reportText], {
      type:
        mode === 'diff' || mode === 'validate' || mode === 'type'
          ? 'text/plain;charset=utf-8'
          : 'application/json',
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
            {output.bigNumbers.length > 0 && (
              <div className={styles.warnings}>
                {messages.json.bigNumberWarning(output.bigNumbers.length)}
              </div>
            )}
            {mode === 'format' &&
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
              {messages.json.sizeLabel}: {output.text.length} B · {messages.json.linesLabel}:{' '}
              {output.text.split('\n').length}
            </div>
          </>
        );
      case 'valid':
        return (
          <div className={styles.validBox}>
            <strong className={styles.validTitle}>✓ {messages.json.valid}</strong>
            {output.bigNumbers.length > 0 && (
              <div className={styles.warnings}>
                {messages.json.bigNumberWarning(output.bigNumbers.length)}
              </div>
            )}
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

  const inputErrorLine =
    output.kind === 'error' && !output.side ? output.error.line ?? null : null;
  const beforeErrorLine =
    output.kind === 'error' && output.side === 'before' ? output.error.line ?? null : null;
  const afterErrorLine =
    output.kind === 'error' && output.side === 'after' ? output.error.line ?? null : null;

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

        <div className={styles.options}>
          {mode === 'format' && (
            <>
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
              <HelpTip text={messages.json.settingsHelp.sortKeys} />
            </label>
            </>
          )}
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={unwrap}
              onChange={(e) => setUnwrap(e.target.checked)}
            />
            {messages.json.unwrapJsonString}
            <HelpTip text={messages.json.settingsHelp.unwrap} />
          </label>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={lenient}
              onChange={(e) => setLenient(e.target.checked)}
            />
            {messages.json.lenient}
            <HelpTip text={messages.json.settingsHelp.lenient} />
          </label>
          <span className={styles.shortcutHint}>{messages.json.keyboardHint}</span>
        </div>
      </header>

      <div className={styles.columns}>
        {mode === 'diff' ? (
          <>
            <div className={styles.editor}>
              <div className={styles.editorLabel}>{messages.json.beforeLabel}</div>
              <JsonEditor
                value={before}
                onChange={setBefore}
                placeholder={messages.json.beforePlaceholder}
                highlightLine={beforeErrorLine}
              />
            </div>
            <div className={styles.editor}>
              <div className={styles.editorLabel}>{messages.json.afterLabel}</div>
              <JsonEditor
                value={after}
                onChange={setAfter}
                placeholder={messages.json.afterPlaceholder}
                highlightLine={afterErrorLine}
              />
            </div>
            <div className={styles.diffResult}>
              <div className={styles.diffToolbar}>
                <button type="button" className="btn btn-primary" onClick={() => void runDiff()}>
                  {messages.json.startCompare}
                </button>
              </div>
              {renderOutput()}
            </div>
          </>
        ) : (
          <>
            <div className={styles.editor}>
              <div className={styles.editorLabel}>{messages.json.inputLabel}</div>
              <JsonEditor
                value={input}
                onChange={setInput}
                placeholder={messages.json.inputPlaceholder}
                highlightLine={inputErrorLine}
              />
            </div>
            <div className={styles.editor}>
              <div className={styles.editorLabel}>
                {messages.json.outputLabel}
                {reportText && (
                  <button
                    type="button"
                    className={styles.copyBtn}
                    onClick={() => void copyOutput()}
                  >
                    {messages.json.copy}
                  </button>
                )}
              </div>
              <div className={styles.output}>
                {renderOutput()}
              </div>
            </div>
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

      {copied && (
        <div className={styles.toast} role="status">
          <span className={styles.toastIcon}>✓</span>
          {messages.json.copySuccess}
        </div>
      )}
    </div>
  );
}
