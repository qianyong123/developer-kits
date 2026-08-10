import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { getSearchQuery, searchPanelOpen } from '@codemirror/search';
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { messages } from '@/shared/i18n/zh';
import { DownloadIcon } from '@/shared/components/Icons';
import { Button } from '@/shared/components/Button/Button';
import HelpTip from '@/shared/components/HelpTip/HelpTip';
import Notice from '@/shared/components/Notice/Notice';
import { Tag } from '@/shared/components/Tag/Tag';
import { useDebouncedEffect } from '@/shared/hooks/useDebounced';
import { useTheme } from '@/shared/hooks/useTheme';
import { downloadUrl } from '@/shared/lib/download';
import { copyText } from '@/shared/lib/clipboard';
import { JsonView, defaultStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import {
  diffJson,
  errorContext,
  formatDiffReport,
  jsonToTsTypes,
  parseJson,
  shortValue,
  sortObjectKeys,
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
/** 超过该长度的字符串值用高亮框完整展示（不再截断） */
const LONG_STRING_LENGTH = 80;

const CHANGE_TONE_CLASS = {
  added: styles.toneAdded,
  removed: styles.toneRemoved,
  old: styles.toneOld,
  new: styles.toneNew,
} as const;

type ChangeTone = keyof typeof CHANGE_TONE_CLASS;

type JsonMode = 'process' | 'diff' | 'type';
type ProcessAction = 'format' | 'minify' | 'validate';

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
  { id: 'process', label: messages.json.modeProcess },
  { id: 'diff', label: messages.json.modeDiff },
  { id: 'type', label: messages.json.modeType },
];

const PROCESS_ACTIONS: ProcessAction[] = ['format', 'minify', 'validate'];
const PROCESS_ACTION_LABELS: Record<ProcessAction, string> = {
  format: messages.json.modeFormat,
  minify: messages.json.modeMinify,
  validate: messages.json.modeValidate,
};

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
    project: '开发工具包',
    version: '0.1.0',
    members: [
      { name: '张三', role: '前端', active: true },
      { name: '李四', role: '后端', active: true },
      { name: '陈七', role: '运维', active: true },
    ],
    config: {
      theme: 'light',
      lang: 'zh-CN',
      limits: { maxFiles: 50, maxSize: 5 },
      legacy: true,
    },
  },
  null,
  2,
);

const SAMPLE_AFTER = JSON.stringify(
  {
    project: '开发工具包',
    version: '0.2.0',
    members: [
      { name: '张三', role: '前端', active: true },
      { name: '李四', role: '后端', active: true },
      { name: '王五', role: '测试', active: true },
      { name: '王五444', role: '测试', active: true },
    ],
    config: {
      theme: 'dark',
      lang: 'zh-CN',
      limits: { maxFiles: 100, maxSize: 10, maxUploads: 20 },
    },
  },
  null,
  2,
);

/** 对比结果中的单个变更值：复杂值用可折叠 JSON 树，简单值直接展示。 */
function ChangeValue({ value, tone }: { value: unknown; tone?: ChangeTone }) {
  const toneClass = tone ? CHANGE_TONE_CLASS[tone] : '';
  if (isLongString(value)) {
    return <div className={`${styles.longString} ${toneClass}`}>{value}</div>;
  }
  if (isPrimitive(value)) {
    return (
      <span className={`${styles.changeValue} ${toneClass}`}>
        {shortValue(value, 160)}
      </span>
    );
  }
  return (
    <div className={`${styles.changeValueTree} ${toneClass}`}>
      <JsonView
        data={value as object}
        style={defaultStyles}
        shouldExpandNode={(level) => level < 1}
      />
    </div>
  );
}

function isPrimitive(value: unknown): boolean {
  return value === null || typeof value !== 'object';
}

function isLongString(value: unknown): value is string {
  return typeof value === 'string' && value.length > LONG_STRING_LENGTH;
}

/** 规范化 JSON 值：字符串里套着 JSON 时自动解包（尊重“自动解包”语义）。 */
function normalizeJsonForOutput(
  value: unknown,
  lenient: boolean,
): { ok: true; value: unknown } | { ok: false; error: JsonError } {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const inner = parseJson(trimmed, { lenient });
      if (!inner.ok) return inner;
      return { ok: true, value: inner.value };
    }
  }
  return { ok: true, value };
}

/** 搜索面板打开时，在编辑器右上角显示匹配数量。 */
function createSearchCountExtension(countClass: string) {
  return ViewPlugin.fromClass(
    class {
      el: HTMLElement;

      constructor(view: EditorView) {
        this.el = document.createElement('div');
        this.el.className = countClass;
        view.dom.appendChild(this.el);
        this.render(view);
      }

      update(update: ViewUpdate) {
        this.render(update.view);
      }

      render(view: EditorView) {
        const panelOpen = searchPanelOpen(view.state);
        const query = getSearchQuery(view.state);
        if (!panelOpen || !query || query.search.trim() === '') {
          this.el.style.display = 'none';
          return;
        }
        let count = 0;
        const cursor = query.getCursor(view.state.doc);
        while (!cursor.next().done) count += 1;
        this.el.textContent = `匹配 ${count} 个`;
        this.el.style.display = 'block';
      }

      destroy() {
        this.el.remove();
      }
    },
  );
}

export default function JsonToolsPage() {
  const [mode, setMode] = useState<JsonMode>('process');
  const [action, setAction] = useState<ProcessAction>('format');
  const { theme } = useTheme();
  const input = useJsonToolsStore((s) => s.input);
  const setInput = useJsonToolsStore((s) => s.setInput);
  const typeInput = useJsonToolsStore((s) => s.typeInput);
  const setTypeInput = useJsonToolsStore((s) => s.setTypeInput);
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
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
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
    const beforeNormalized = normalizeJsonForOutput(parsedBefore.value, lenient);
    if (!beforeNormalized.ok) {
      setOutput({ kind: 'error', error: beforeNormalized.error, side: 'before' });
      return;
    }
    const afterNormalized = normalizeJsonForOutput(parsedAfter.value, lenient);
    if (!afterNormalized.ok) {
      setOutput({ kind: 'error', error: afterNormalized.error, side: 'after' });
      return;
    }
    // 两边都合法：先转成标准 JSON 格式写回编辑器，再执行对比
    setBefore(JSON.stringify(beforeNormalized.value, null, 2));
    setAfter(JSON.stringify(afterNormalized.value, null, 2));
    const changes = diffJson(beforeNormalized.value, afterNormalized.value);
    setOutput({ kind: 'diff', changes });
    // 对比后默认全部选中
    setSelected(new Set(changes.map((_, i) => i)));
  }, [before, after, lenient, setBefore, setAfter]);

  const swapSides = useCallback(() => {
    setBefore(after);
    setAfter(before);
    setOutput({ kind: 'idle' });
    setSelected(new Set());
  }, [before, after, setBefore, setAfter]);

  const toggleSelect = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const selectAll = useCallback(() => {
    if (output.kind !== 'diff') return;
    setSelected(new Set(output.changes.map((_, i) => i)));
  }, [output]);

  const copyDiffResult = useCallback(async () => {
    if (output.kind !== 'diff' || output.changes.length === 0) return;
    const indexes = output.changes.map((_, i) => i);
    const targets =
      selected.size > 0 ? indexes.filter((i) => selected.has(i)) : indexes;
    const text = formatDiffReport(targets.map((i) => output.changes[i]));
    if (await copyText(text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      setNotice(messages.json.copyFailed);
    }
  }, [output, selected]);

  const runAction = useCallback((act: ProcessAction) => {
    if (input.trim() === '') {
      setOutput({ kind: 'idle' });
      return;
    }

    if (act === 'validate') {
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

    const parsed = parseJson(input, { lenient });
    if (!parsed.ok) {
      setOutput({ kind: 'error', error: parsed.error });
      return;
    }
    // 字符串里套着 JSON（如日志里带引号的 JSON）：格式化/压缩时自动解包，
    // 无需手动开启“自动解包”，避免“点了没反应”
    const normalized = normalizeJsonForOutput(parsed.value, lenient);
    if (!normalized.ok) {
      setOutput({ kind: 'error', error: normalized.error });
      return;
    }
    const value = normalized.value;
    const text =
      act === 'format'
        ? JSON.stringify(sortKeys ? sortObjectKeys(value) : value, null, indent)
        : JSON.stringify(value);
    // 格式化/压缩：结果直接写回输入框
    setInput(text);
    setOutput({ kind: 'idle' });
  }, [input, indent, sortKeys, unwrap, lenient, setInput]);

  const runType = useCallback(() => {
    if (typeInput.trim() === '') {
      setOutput({ kind: 'idle' });
      return;
    }
    const parsed = parseJson(typeInput, { lenient });
    if (!parsed.ok) {
      setOutput({ kind: 'error', error: parsed.error });
      return;
    }
    const value = unwrap ? unwrapJsonString(parsed.value, lenient) : parsed.value;
    setOutput({ kind: 'text', text: jsonToTsTypes(value), value, bigNumbers: [] });
  }, [typeInput, unwrap, lenient]);

  // 类型模式自动处理；处理/对比模式改为点击按钮手动触发
  useDebouncedEffect(
    () => {
      if (mode === 'type') runType();
    },
    [mode, runType],
    250,
  );

  // 快捷键：Ctrl/Cmd + Enter 立即处理
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (mode === 'diff') runDiff();
        else if (mode === 'type') runType();
        else runAction(action);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, action, runAction, runDiff, runType]);

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
        else if (mode === 'type') setTypeInput(text);
        else setInput(text);
      };
      reader.readAsText(file);
    },
    [mode, setBefore, setTypeInput, setInput],
  );

  const loadSample = useCallback(() => {
    if (mode === 'diff') {
      setBefore(SAMPLE_BEFORE);
      setAfter(SAMPLE_AFTER);
    } else if (mode === 'type') {
      setTypeInput(SAMPLE);
    } else {
      setInput(SAMPLE);
    }
  }, [mode, setBefore, setAfter, setTypeInput, setInput]);

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

  /** 下载内容：处理模式下载输入框当前内容（校验模式下载校验报告） */
  const downloadText = useMemo(() => {
    if (mode === 'process') {
      if (action === 'validate') return output.kind === 'valid' ? reportText : '';
      return input;
    }
    return reportText;
  }, [mode, action, input, output, reportText]);

  const copyOutput = useCallback(async () => {
    if (!reportText) return;
    if (await copyText(reportText)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      setNotice(messages.json.copyFailed);
    }
  }, [reportText]);

  const copyInput = useCallback(async () => {
    if (!input) return;
    if (await copyText(input)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      setNotice(messages.json.copyFailed);
    }
  }, [input]);

  const downloadOutput = useCallback(() => {
    if (!downloadText) return;
    const blob = new Blob([downloadText], {
      type:
        mode === 'diff' ||
        mode === 'type' ||
        (mode === 'process' && action === 'validate')
          ? 'text/plain;charset=utf-8'
          : 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const fileName =
      mode === 'process'
        ? messages.json.downloadName[action]
        : messages.json.downloadName[mode];
    downloadUrl(url, fileName);
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }, [downloadText, mode, action]);

  const errorView = (error: JsonError, side: 'before' | 'after' | undefined, text: string) => {
    const ctx = errorContext(text, error);
    return (
      <div className={styles.errorBox}>
        <strong>{mode === 'type' ? messages.json.typeErrorTitle : messages.json.invalid}</strong>
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
  };

  const validView = (info: { duplicates: DuplicateKeyInfo[]; bigNumbers: BigNumberInfo[] }) => (
    <div className={styles.validBox}>
      <strong className={styles.validTitle}>✓ {messages.json.valid}</strong>
      {info.bigNumbers.length > 0 && (
        <div className={styles.warnings}>
          {messages.json.bigNumberWarning(info.bigNumbers.length)}
        </div>
      )}
      {info.duplicates.length > 0 && (
        <div className={styles.warnings}>
          <strong>{messages.json.warningsTitle}</strong>
          {info.duplicates.map((d, i) => (
            <p key={i}>{messages.json.duplicateKey(d.key, d.firstLine, d.secondLine)}</p>
          ))}
        </div>
      )}
    </div>
  );

  /** 处理模式下按钮下方的结果/错误提示 */
  const renderProcessMessage = () => {
    if (output.kind === 'error') return errorView(output.error, output.side, input);
    if (output.kind === 'valid') return validView(output);
    return null;
  };

  const renderOutput = () => {
    switch (output.kind) {
      case 'idle':
        return <div className={styles.placeholder}>{messages.json.outputPlaceholder}</div>;
      case 'error':
        return errorView(
          output.error,
          output.side,
          output.side === 'before' ? before : output.side === 'after' ? after : input,
        );
      case 'text':
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
                <Button variant="primary" size="sm" onClick={() => void copyOutput()}>
                  {messages.json.copy}
                </Button>
              )}
            </div>
          </>
        );
      case 'valid':
        return validView(output);
      case 'diff': {
        const added = output.changes.filter((c) => c.type === 'added').length;
        const removed = output.changes.filter((c) => c.type === 'removed').length;
        const changed = output.changes.filter((c) => c.type === 'changed').length;
        return (
          <div className={styles.diffBox}>
            {output.changes.length === 0 ? (
              <div className={styles.diffNone}>{messages.json.diffNone}</div>
            ) : (
              <>
                <div className={styles.diffHeader}>
                  <strong className={styles.diffTitle}>{messages.json.diffResultTitle}</strong>
                  <span className={styles.diffStats}>
                    {messages.json.diffFound(output.changes.length)} ·{' '}
                    <Tag variant="success">
                      +{added} {messages.json.changeAdded}
                    </Tag>{' '}
                    ·{' '}
                    <Tag variant="danger">
                      -{removed} {messages.json.changeRemoved}
                    </Tag>{' '}
                    ·{' '}
                    <Tag variant="warning">
                      ~{changed} {messages.json.changeChanged}
                    </Tag>{' '}
                    ·{' '}
                    <span className={styles.diffSelectedCount}>
                      {messages.json.diffSelected(selected.size)}
                    </span>
                  </span>
                  <span className={styles.toolbarRight}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={
                        output.changes.length > 0 && selected.size === output.changes.length
                          ? clearSelection
                          : selectAll
                      }
                    >
                      {output.changes.length > 0 && selected.size === output.changes.length
                        ? messages.json.clearSelection
                        : messages.json.selectAll}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void copyDiffResult()}
                    >
                      {messages.json.copyResult}
                    </Button>
                  </span>
                </div>
                <div className={styles.changeList}>
                  {output.changes.map((change, i) => (
                    <div
                      key={i}
                      className={`${styles.changeRow} ${
                        selected.has(i) ? styles.changeRowSelected : ''
                      }`}
                      onClick={() => toggleSelect(i)}
                    >
                      <div className={styles.changeHeader}>
                        <input
                          type="checkbox"
                          className={styles.changeCheckbox}
                          checked={selected.has(i)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleSelect(i)}
                        />
                        <span className={`${styles.changeBadge} ${styles[change.type]}`}>
                          {change.type === 'added'
                            ? messages.json.changeAdded
                            : change.type === 'removed'
                              ? messages.json.changeRemoved
                              : messages.json.changeChanged}
                        </span>
                        <code className={styles.changePath}>
                          {change.path.replace(/^\$\.?/, '')}
                        </code>
                      </div>
                      <div
                        className={styles.changeBody}
                        onClick={(e) => {
                          // 只有点击树形折叠图标时不选中行；值区域其他位置仍可选中
                          const target = e.target as HTMLElement;
                          if (target.closest('[role="button"]')) e.stopPropagation();
                        }}
                      >
                        {change.type === 'added' && (
                          <ChangeValue value={change.after} tone="added" />
                        )}
                        {change.type === 'removed' && (
                          <ChangeValue value={change.before} tone="removed" />
                        )}
                        {change.type === 'changed' &&
                          (!isLongString(change.before) &&
                          !isLongString(change.after) &&
                          isPrimitive(change.before) &&
                          isPrimitive(change.after) ? (
                            <span className={styles.changeValue}>
                              <span className={styles.toneOld}>
                                {shortValue(change.before, 120)}
                              </span>{' '}
                              →{' '}
                              <span className={styles.toneNew}>
                                {shortValue(change.after, 120)}
                              </span>
                            </span>
                          ) : (
                            <div className={styles.changePair}>
                              <div className={styles.changePairSide}>
                                <span className={styles.changeSide}>
                                  {messages.json.diffOld}
                                </span>
                                <ChangeValue value={change.before} tone="old" />
                              </div>
                              <div className={styles.changePairSide}>
                                <span className={styles.changeSide}>
                                  {messages.json.diffNew}
                                </span>
                                <ChangeValue value={change.after} tone="new" />
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      }
    }
  };

  const inputErrorLine =
    output.kind === 'error' && !output.side ? output.error.line ?? null : null;
  // CodeMirror 错误行高亮（根据报错行号定位）
  const errorLineExtension = useMemo(() => {
    if (inputErrorLine == null) return [];
    const deco = Decoration.line({ class: styles.cmErrorLine });
    return EditorView.decorations.of((view) => {
      if (inputErrorLine < 1 || inputErrorLine > view.state.doc.lines) return Decoration.none;
      const line = view.state.doc.line(inputErrorLine);
      return Decoration.set([deco.range(line.from)]);
    });
  }, [inputErrorLine]);
  const searchCountExtension = useMemo(
    () => createSearchCountExtension(styles.cmSearchCount),
    [],
  );
  const cmExtensions = useMemo(
    () => [json(), errorLineExtension, searchCountExtension],
    [errorLineExtension, searchCountExtension],
  );
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
            <Button onClick={() => fileInputRef.current?.click()}>
              {messages.json.importFile}
            </Button>
            <Button onClick={loadSample}>
              {messages.json.loadSample}
            </Button>
            <Button disabled={!downloadText} onClick={downloadOutput}>
              <DownloadIcon size={14} />
              {messages.json.download}
            </Button>
            <Button variant="danger" onClick={clearAll}>
              {messages.json.clear}
            </Button>
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
          {mode === 'process' && (
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
          {mode === 'type' && (
            <span className={styles.modeHint}>{messages.json.modeTypeHint}</span>
          )}
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
                <Button variant="primary" onClick={() => void runDiff()}>
                  {messages.json.startCompare}
                </Button>
                <Button onClick={swapSides}>
                  {messages.json.swapSides}
                </Button>
              </div>
              {renderOutput()}
            </div>
          </>
        ) : mode === 'process' ? (
          <div className={styles.processColumn}>
            <div className={styles.editor}>
              <div className={styles.editorLabel}>{messages.json.inputLabel}</div>
              <div className={styles.cmBox}>
                <CodeMirror
                  value={input}
                  onChange={setInput}
                  height="100%"
                  theme={theme === 'dark' ? 'dark' : 'light'}
                  extensions={cmExtensions}
                  placeholder={messages.json.inputPlaceholder}
                />
              </div>
            </div>
            <div className={styles.processToolbar}>
              {PROCESS_ACTIONS.map((act) => (
                <button
                  key={act}
                  type="button"
                  className={act === action ? styles.segmentActive : styles.segment}
                  onClick={() => {
                    setAction(act);
                    runAction(act);
                  }}
                >
                  {PROCESS_ACTION_LABELS[act]}
                </button>
              ))}
              <span className={styles.cmHint}>{messages.json.cmSearchHint}</span>
              <span className={styles.toolbarRight}>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!input}
                  onClick={() => void copyInput()}
                >
                  {messages.json.copy}
                </Button>
              </span>
            </div>
            {renderProcessMessage()}
          </div>
        ) : (
          <>
            <div className={styles.editor}>
              <div className={styles.editorLabel}>{messages.json.inputLabel}</div>
              <JsonEditor
                value={typeInput}
                onChange={setTypeInput}
                placeholder={messages.json.inputPlaceholder}
                highlightLine={inputErrorLine}
              />
            </div>
            <div className={styles.editor}>
              <div className={styles.editorLabel}>
                {messages.json.outputLabel}
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
