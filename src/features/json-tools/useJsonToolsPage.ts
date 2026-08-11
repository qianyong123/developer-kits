import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { messages } from '@/shared/i18n/zh';
import { useDebouncedEffect } from '@/shared/hooks/useDebounced';
import { useTheme } from '@/shared/hooks/useTheme';
import { downloadUrl } from '@/shared/lib/download';
import { copyText } from '@/shared/lib/clipboard';
import {
  diffJson,
  formatDiffReport,
  jsonToTsTypes,
  parseJson,
  sortObjectKeys,
  unwrapJsonString,
  validateJson,
} from '@/features/json-tools/lib/json';
import { normalizeJsonForOutput } from '@/features/json-tools/lib/normalize';
import {
  MAX_FILE_SIZE,
  SAMPLE,
  SAMPLE_AFTER,
  SAMPLE_BEFORE,
} from '@/features/json-tools/constants';
import { useJsonToolsStore } from '@/features/json-tools/store';
import type { JsonMode, OutputState, ProcessAction } from '@/features/json-tools/types';

/** JSON 工具页面的状态编排与业务逻辑，页面组件只负责 JSX 拼装。 */
export function useJsonToolsPage() {
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
  const lenient = useJsonToolsStore((s) => s.lenient);
  const setLenient = useJsonToolsStore((s) => s.setLenient);
  const clearData = useJsonToolsStore((s) => s.clearData);
  const [output, setOutput] = useState<OutputState>({ kind: 'idle' });
  const [notice, setNotice] = useState<string | null>(null);
  /** 未选中差异项的提示弹框：null 关闭，字符串为提示文案 */
  const [hintDialog, setHintDialog] = useState<string | null>(null);
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

  /** 对比模式：仅输出选中的差异项报告（复制/下载共用），未选中时为空。 */
  const diffSelectedReport = useMemo(() => {
    if (output.kind !== 'diff') return '';
    return formatDiffReport(output.changes.filter((_, i) => selected.has(i)));
  }, [output, selected]);

  const copyDiffResult = useCallback(async () => {
    if (output.kind !== 'diff' || output.changes.length === 0) return;
    // 复制前校验是否选中差异项，未选中时弹框提示，不复制
    if (selected.size === 0) {
      setHintDialog(messages.json.noSelectionCopy);
      return;
    }
    if (await copyText(diffSelectedReport)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      setNotice(messages.json.copyFailed);
    }
  }, [output, selected, diffSelectedReport]);

  const runAction = useCallback(
    (act: ProcessAction) => {
      if (input.trim() === '') {
        setOutput({ kind: 'idle' });
        return;
      }

      if (act === 'validate') {
        // 自动解包默认开启：带引号的 JSON 字符串按内层 JSON 校验
        const result = validateJson(input, { unwrapString: true, lenient });
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
    },
    [input, indent, sortKeys, lenient, setInput],
  );

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
    // 自动解包默认开启：字符串里套着 JSON 时按内层结构生成类型
    const value = unwrapJsonString(parsed.value, lenient);
    setOutput({ kind: 'text', text: jsonToTsTypes(value), value, bigNumbers: [] });
  }, [typeInput, lenient]);

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
    // 对比模式：下载前校验是否选中差异项，未选中时弹框提示，不下载
    if (mode === 'diff' && selected.size === 0) {
      setHintDialog(messages.json.noSelectionDownload);
      return;
    }
    // 对比模式只下载选中的差异项；其余模式按原下载内容
    const content = mode === 'diff' ? diffSelectedReport : downloadText;
    const blob = new Blob([content], {
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
  }, [downloadText, diffSelectedReport, mode, action, selected]);

  const inputErrorLine =
    output.kind === 'error' && !output.side ? output.error.line ?? null : null;
  const beforeErrorLine =
    output.kind === 'error' && output.side === 'before' ? output.error.line ?? null : null;
  const afterErrorLine =
    output.kind === 'error' && output.side === 'after' ? output.error.line ?? null : null;

  return {
    mode,
    setMode,
    action,
    setAction,
    theme,
    input,
    setInput,
    typeInput,
    setTypeInput,
    before,
    setBefore,
    after,
    setAfter,
    indent,
    setIndent,
    sortKeys,
    setSortKeys,
    lenient,
    setLenient,
    output,
    notice,
    setNotice,
    hintDialog,
    setHintDialog,
    copied,
    selected,
    fileInputRef,
    inputErrorLine,
    beforeErrorLine,
    afterErrorLine,
    downloadText,
    runDiff,
    swapSides,
    toggleSelect,
    clearSelection,
    selectAll,
    copyDiffResult,
    runAction,
    runType,
    handleFile,
    loadSample,
    clearAll,
    copyOutput,
    copyInput,
    downloadOutput,
  };
}
