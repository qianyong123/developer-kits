import { useCallback, useEffect, useRef, useState } from 'react';
import { messages } from '../../shared/i18n/zh';
import { DownloadIcon, RefreshIcon, TrashIcon } from '../../shared/components/Icons';
import FileDropZone from '../../shared/components/FileDropZone/FileDropZone';
import { useDebouncedEffect } from '../../shared/hooks/useDebounced';
import { downloadUrl } from '../../shared/lib/download';
import { formatBytes, ratioPercent } from '../../shared/lib/format';
import { imageHasTransparency } from '../../shared/lib/hasTransparency';
import { buildZipBlob } from '../image-compressor/lib/zip';
import SvgCard from './components/SvgCard';
import SvgCompareDialog from './components/SvgCompareDialog';
import SvgSettingsPanel from './components/SvgSettingsPanel';
import { disposeWorkerPool, optimizeSvg } from './lib/optimize';
import {
  isSvgFile,
  isSvgzName,
  MAX_SVG_FILE_SIZE,
  readSvgText,
  svgOutputName,
} from './lib/svgFile';
import type { SvgItem, SvgOutputFormat, SvgResult, SvgSettings } from './lib/types';
import styles from './SvgCompressorPage.module.css';

const SVG_PICK_TYPES = [
  {
    description: 'SVG',
    accept: {
      'image/svg+xml': ['.svg', '.svgz'],
      'application/gzip': ['.svgz'],
    },
  },
];

const DEFAULT_SETTINGS: SvgSettings = {
  preset: 'balanced',
  format: 'svg',
};

let idCounter = 0;
const nextId = () => `svg-${++idCounter}`;

function describeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  return /xml/i.test(msg) ? messages.svg.errorParse : messages.svg.errorWorker;
}

export default function SvgCompressorPage() {
  const [items, setItems] = useState<SvgItem[]>([]);
  const [settings, setSettings] = useState<SvgSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [needCompress, setNeedCompress] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const genRef = useRef(0);
  // 待压缩目标：null = 全部（设置变更/手动压缩），id 列表 = 仅新增的文件
  const compressTargetRef = useRef<string[] | null>(null);

  useEffect(() => () => disposeWorkerPool(), []);

  const updateItem = useCallback((id: string, patch: Partial<SvgItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const startCompress = useCallback(async (targetIds?: string[]) => {
    const current = itemsRef.current;
    const idSet = targetIds ? new Set(targetIds) : null;
    const targets = current.filter((it) => {
      if (!idSet) return true;
      return idSet.has(it.id) || it.status === 'pending' || it.status === 'processing';
    });
    if (targets.length === 0) return;
    const targetSet = new Set(targets.map((it) => it.id));

    const gen = ++genRef.current;
    const snapshot = current.map((it) => {
      if (!targetSet.has(it.id)) return it;
      if (it.result) URL.revokeObjectURL(it.result.previewUrl);
      return { ...it, status: 'pending' as const, result: undefined, error: undefined };
    });
    setItems(snapshot);
    setBusy(true);
    const runSettings = settingsRef.current;

    await Promise.all(
      targets.map(async (item) => {
        if (genRef.current !== gen) return;
        updateItem(item.id, { status: 'processing' });
        try {
          const optimized = await optimizeSvg(
            item.originalCode,
            runSettings.preset,
            runSettings.format,
          );
          if (genRef.current !== gen) return;
          const result = buildResult(item, optimized);
          updateItem(item.id, { status: 'done', result });
        } catch (err) {
          if (genRef.current !== gen) return;
          updateItem(item.id, { status: 'error', error: describeError(err) });
        }
      }),
    );

    if (genRef.current === gen) setBusy(false);
  }, [updateItem]);

  useEffect(() => {
    if (!needCompress) return;
    setNeedCompress(false);
    const target = compressTargetRef.current;
    compressTargetRef.current = null;
    void startCompress(target ?? undefined);
  }, [needCompress, startCompress]);

  useDebouncedEffect(
    () => {
      if (itemsRef.current.length > 0) {
        compressTargetRef.current = null; // 设置变更：全部重新压缩
        setNeedCompress(true);
      }
    },
    [JSON.stringify(settings)],
    300,
  );

  const addFiles = useCallback(async (files: File[]) => {
    const notices: string[] = [];
    const svgFiles = files.filter(isSvgFile);
    const ignored = files.length - svgFiles.length;
    if (ignored > 0) notices.push(messages.svg.unsupportedFormat(`${ignored} 个文件`));

    const sizeOk = svgFiles.filter((f) => f.size <= MAX_SVG_FILE_SIZE);
    if (sizeOk.length !== svgFiles.length) notices.push(messages.svg.fileTooLarge);
    setNotice(notices.length > 0 ? notices.join('；') : null);

    const created: SvgItem[] = [];
    for (const file of sizeOk) {
      try {
        const originalCode = await readSvgText(file);
        const hasTransparency = await imageHasTransparency(
          new Blob([originalCode], { type: 'image/svg+xml' }),
        );
        created.push({
          id: nextId(),
          file,
          originalUrl: URL.createObjectURL(
            new Blob([originalCode], { type: 'image/svg+xml' }),
          ),
          originalSize: file.size,
          originalCode,
          hasTransparency,
          status: 'pending',
        });
      } catch {
        notices.push(messages.svg.readFailed(file.name));
      }
    }
    if (notices.length > 0) setNotice(notices.join('；'));
    if (created.length === 0) return;

    setItems((prev) => [...created, ...prev]); // 最新上传的排在最前
    compressTargetRef.current = created.map((it) => it.id); // 只压缩新上传的文件
    setNeedCompress(true);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target) {
        URL.revokeObjectURL(target.originalUrl);
        if (target.result && target.result.previewUrl !== target.originalUrl) {
          URL.revokeObjectURL(target.result.previewUrl);
        }
      }
      return prev.filter((it) => it.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    itemsRef.current.forEach((it) => {
      URL.revokeObjectURL(it.originalUrl);
      if (it.result && it.result.previewUrl !== it.originalUrl) {
        URL.revokeObjectURL(it.result.previewUrl);
      }
    });
    genRef.current += 1; // 终止进行中的压缩
    setItems([]);
    setBusy(false);
    setNotice(null);
  }, []);

  const downloadOne = useCallback((item: SvgItem) => {
    if (!item.result) return;
    const url = URL.createObjectURL(item.result.blob);
    downloadUrl(url, svgOutputName(item.file.name, item.result.format));
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }, []);

  const downloadAll = useCallback(async () => {
    const done = itemsRef.current.filter((it) => it.result);
    if (done.length === 0) return;

    setZipping(true);
    try {
      const entries = await Promise.all(
        done.map(async (it) => ({
          name: svgOutputName(it.file.name, it.result!.format),
          blob: it.result!.blob,
        })),
      );
      // SVG 文本用 ZIP 压缩；SVGZ 本身已 gzip，ZIP 层用存储模式
      const level = settingsRef.current.format === 'svgz' ? 0 : 6;
      const zipBlob = await buildZipBlob(entries, level);
      const url = URL.createObjectURL(zipBlob);
      downloadUrl(url, 'compressed-svgs.zip');
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } finally {
      setZipping(false);
    }
  }, []);

  const compareItem = items.find((it) => it.id === compareId && it.result) ?? null;
  const resultCount = items.filter((it) => it.result).length;
  const doneItems = items.filter((it) => it.result);
  const totalOriginal = doneItems.reduce((sum, it) => sum + it.originalSize, 0);
  const totalCompressed = doneItems.reduce((sum, it) => sum + (it.result?.size ?? 0), 0);
  const finishedCount = items.filter((it) => it.status === 'done' || it.status === 'error').length;
  const overallPct =
    items.length === 0
      ? 0
      : Math.round(
          (items.reduce((sum, it) => {
            if (it.status === 'done' || it.status === 'error') return sum + 1;
            if (it.status === 'processing') return sum + 0.5;
            return sum;
          }, 0) /
            items.length) *
            100,
        );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.headerLeft}>
            <h1>{messages.svg.title}</h1>
            <p className={styles.subtitle}>{messages.svg.subtitle}</p>
          </div>
          <div className={styles.toolbar}>
            <button className="btn" disabled={busy || items.length === 0} onClick={() => void startCompress()}>
              <RefreshIcon size={14} />
              {messages.svg.recompress}
            </button>
            <button className="btn btn-ghost-danger" disabled={items.length === 0} onClick={clearAll}>
              <TrashIcon size={14} />
              {messages.svg.clearAll}
            </button>
            <button
              className="btn btn-primary"
              disabled={zipping || resultCount === 0}
              onClick={() => void downloadAll()}
            >
              <DownloadIcon size={14} />
              {zipping ? messages.svg.zipping : messages.svg.downloadAll}
            </button>
          </div>
        </div>

      </header>

      <div className={styles.columns}>
        <div className={styles.mainCol}>
          <FileDropZone
            accept=".svg,.svgz"
            pickTypes={SVG_PICK_TYPES}
            dragTitle={messages.svg.dropTitle}
            tapTitle={messages.svg.tapTitle}
            hint={messages.svg.dropHint}
            features={[messages.svg.featureLocal]}
            onFiles={addFiles}
          />

          {notice && (
            <div className={styles.notice}>
              <span>{notice}</span>
              <button className={styles.noticeClose} onClick={() => setNotice(null)}>
                ✕
              </button>
            </div>
          )}

          <button
            className={styles.mobileSettingsToggle}
            onClick={() => setMobileSettingsOpen((v) => !v)}
            aria-expanded={mobileSettingsOpen}
          >
            {messages.svg.settings}
            {busy ? ` · ${overallPct}%` : ''}
          </button>

          <section className={styles.list}>
            {items.length > 0 && (
              <>
                {busy && (
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${overallPct}%` }} />
                    <span>
                      {messages.svg.processed} {finishedCount} {messages.svg.of} {items.length} ·{' '}
                      {overallPct}%
                    </span>
                  </div>
                )}
                {doneItems.length > 0 && (
                  <div className={styles.summary}>
                    <span>
                      {messages.svg.summary} {doneItems.length} {messages.svg.files} ·{' '}
                      {messages.svg.original}: <b>{formatBytes(totalOriginal)}</b> ·{' '}
                      {messages.svg.compressed}: <b>{formatBytes(totalCompressed)}</b> ·{' '}
                      {messages.svg.totalRatio}:{' '}
                      <b
                        className={
                          totalCompressed > totalOriginal ? styles.summaryBad : styles.summaryGood
                        }
                      >
                        {ratioPercent(totalOriginal, totalCompressed)}
                      </b>
                    </span>
                  </div>
                )}
                <div className={styles.grid}>
                  {items.map((it) => (
                    <SvgCard
                      key={it.id}
                      item={it}
                      previewBg={it.hasTransparency ? 'checker' : 'white'}
                      onRemove={removeItem}
                      onDownload={downloadOne}
                      onCompare={setCompareId}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        </div>

        {mobileSettingsOpen && (
          <div className={styles.scrim} onClick={() => setMobileSettingsOpen(false)} />
        )}
        <aside
          className={`${styles.settings} ${mobileSettingsOpen ? styles.settingsOpen : ''} ${
            !mobileSettingsOpen && settingsCollapsed ? styles.settingsCollapsed : ''
          }`}
        >
          <SvgSettingsPanel
            settings={settings}
            onChange={setSettings}
            collapsed={mobileSettingsOpen ? false : settingsCollapsed}
            onToggleCollapse={() => setSettingsCollapsed((v) => !v)}
          />
        </aside>
      </div>

      {compareItem && (
        <SvgCompareDialog
          item={compareItem}
          onClose={() => setCompareId(null)}
          previewBg={compareItem.hasTransparency ? 'checker' : 'white'}
        />
      )}
    </div>
  );
}

function buildResult(
  item: SvgItem,
  optimized: {
    code: string;
    blob: Blob;
    previewBlob: Blob;
    size: number;
    format: SvgOutputFormat;
  },
): SvgResult {
  // 优化后不小于原文件时保留原文件，不输出更差的结果
  if (optimized.size >= item.originalSize) {
    return {
      blob: item.file,
      previewUrl: item.originalUrl,
      size: item.originalSize,
      format: isSvgzName(item.file.name) ? 'svgz' : 'svg',
      code: item.originalCode,
      note: 'kept-original',
    };
  }
  return {
    blob: optimized.blob,
    previewUrl: URL.createObjectURL(optimized.previewBlob),
    size: optimized.size,
    format: optimized.format,
    code: optimized.code,
  };
}
