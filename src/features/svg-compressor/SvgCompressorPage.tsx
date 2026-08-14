import { useCallback, useEffect, useRef, useState } from 'react';
import { messages } from '@/shared/i18n/zh';
import { DownloadIcon, RefreshIcon, TrashIcon } from '@/shared/components/Icons';
import FileDropZone from '@/shared/components/FileDropZone/FileDropZone';
import Notice from '@/shared/components/Notice/Notice';
import ProgressBar from '@/shared/components/ProgressBar/ProgressBar';
import SummaryBar from '@/shared/components/SummaryBar/SummaryBar';
import { useDebouncedEffect } from '@/shared/hooks/useDebounced';
import { useWorkbench } from '@/shared/hooks/useWorkbench';
import { downloadUrl } from '@/shared/lib/download';
import { formatBytes, ratioPercent } from '@/shared/lib/format';
import { imageHasTransparency } from '@/shared/lib/hasTransparency';
import { buildZipBlob } from '@/features/image-compressor/lib/zip';
import SvgCard from '@/features/svg-compressor/components/SvgCard';
import SvgCompareDialog from '@/features/svg-compressor/components/SvgCompareDialog';
import SvgSettingsPanel from '@/features/svg-compressor/components/SvgSettingsPanel';
import {
  cancelWorkerPool,
  disposeWorkerPool,
  optimizeSvg,
} from '@/features/svg-compressor/lib/optimize';
import { svgSettingsKey, useSvgSettingsStore } from '@/features/svg-compressor/stores';
import {
  analyzeEmbeddedImages,
  isSvgFile,
  isSvgzName,
  MAX_SVG_FILE_SIZE,
  readSvgText,
  svgOutputName,
} from '@/features/svg-compressor/lib/svgFile';
import type {
  SvgItem,
  SvgOutputFormat,
  SvgResult,
} from '@/features/svg-compressor/lib/types';
import styles from '@/features/svg-compressor/SvgCompressorPage.module.css';

const SVG_PICK_TYPES = [
  {
    description: 'SVG',
    accept: {
      'image/svg+xml': ['.svg', '.svgz'],
      'application/gzip': ['.svgz'],
    },
  },
];

const MAX_FILES_PER_BATCH = 50;

let idCounter = 0;
const nextId = () => `svg-${++idCounter}`;

function describeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  return /xml/i.test(msg) ? messages.svg.errorParse : messages.svg.errorWorker;
}

export default function SvgCompressorPage() {
  const settings = useSvgSettingsStore((s) => s.settings);
  const setSettings = useSvgSettingsStore((s) => s.setSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [zipping, setZipping] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);

  useEffect(() => () => disposeWorkerPool(), []);

  const buildItems = useCallback(async (files: File[]) => {
    const notices: string[] = [];
    const svgFiles = files.filter(isSvgFile);
    const ignored = files.length - svgFiles.length;
    if (ignored > 0) notices.push(messages.svg.unsupportedFormat(`${ignored} 个文件`));

    const sizeOk = svgFiles.filter((f) => f.size <= MAX_SVG_FILE_SIZE);
    if (sizeOk.length !== svgFiles.length) notices.push(messages.svg.fileTooLarge);

    // 批量读取并行处理（保持原有顺序），单个文件失败不影响其余文件
    type BuildOutcome = { ok: true; item: SvgItem } | { ok: false; file: File };
    const outcomes = await Promise.all(
      sizeOk.map(async (file): Promise<BuildOutcome> => {
        try {
          const originalCode = await readSvgText(file);
          const originalBlob = new Blob([originalCode], { type: 'image/svg+xml' });
          const hasTransparency = await imageHasTransparency(originalBlob);
          return {
            ok: true,
            item: {
              id: nextId(),
              file,
              originalUrl: URL.createObjectURL(originalBlob),
              originalSize: file.size,
              originalCode,
              hasTransparency,
              embeddedImages: analyzeEmbeddedImages(originalCode, file.size),
              status: 'pending',
            },
          };
        } catch {
          return { ok: false, file };
        }
      }),
    );
    const created = outcomes
      .filter((r): r is Extract<BuildOutcome, { ok: true }> => r.ok)
      .map((r) => r.item);
    for (const outcome of outcomes) {
      if (!outcome.ok) notices.push(messages.svg.readFailed(outcome.file.name));
    }
    return {
      created,
      compressIds: created.map((it) => it.id), // 只压缩新上传的文件
      notice: notices.length > 0 ? notices.join('；') : undefined,
    };
  }, []);

  const runTask = useCallback(
    async (item: SvgItem) =>
      buildResult(
        item,
        await optimizeSvg(item.originalCode, settingsRef.current.preset, settingsRef.current.format),
      ),
    [],
  );

  const {
    items,
    itemsRef,
    busy,
    notice,
    setNotice,
    addFiles,
    removeItem,
    clearAll,
    recompressAll,
  } = useWorkbench<SvgItem>({
    maxItems: MAX_FILES_PER_BATCH,
    tooManyNotice: (n) => messages.svg.fileCountExceeded(n),
    buildItems,
    runTask,
    errorMessage: describeError,
    concurrency: 0, // Worker 池内部自控并发
    revokeResult: (result, item) => {
      if (result.previewUrl !== item.originalUrl) URL.revokeObjectURL(result.previewUrl);
    },
  });

  // 设置变更：全部重新压缩（防抖）；文件名前缀/后缀不影响压缩结果，不触发重跑
  useDebouncedEffect(() => {
    cancelWorkerPool(); // 取消旧代次任务，避免继续占用 Worker
    recompressAll();
  }, [svgSettingsKey(settings)], 300);

  const downloadOne = useCallback((item: SvgItem) => {
    if (!item.result) return;
    const url = URL.createObjectURL(item.result.blob);
    const { namePrefix, nameSuffix } = settingsRef.current;
    downloadUrl(url, svgOutputName(item.file.name, item.result.format, namePrefix, nameSuffix));
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }, []);

  const downloadAll = useCallback(async () => {
    const done = itemsRef.current.filter((it) => it.result);
    if (done.length === 0) return;

    const { namePrefix, nameSuffix } = settingsRef.current;
    setZipping(true);
    try {
      const entries = await Promise.all(
        done.map(async (it) => ({
          name: svgOutputName(it.file.name, it.result!.format, namePrefix, nameSuffix),
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
  }, [itemsRef]);

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
            <button
              className="btn"
              disabled={busy || items.length === 0}
              onClick={() => void recompressAll()}
            >
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

          {notice && <Notice text={notice} onClose={() => setNotice(null)} />}

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
                  <ProgressBar
                    percent={overallPct}
                    done={finishedCount}
                    total={items.length}
                    processedLabel={messages.svg.processed}
                    ofLabel={messages.svg.of}
                  />
                )}
                {doneItems.length > 0 && (
                  <SummaryBar
                    summaryLabel={messages.svg.summary}
                    count={doneItems.length}
                    countUnit={messages.svg.files}
                    originalLabel={messages.svg.original}
                    originalValue={formatBytes(totalOriginal)}
                    compressedLabel={messages.svg.compressed}
                    compressedValue={formatBytes(totalCompressed)}
                    ratioLabel={messages.svg.totalRatio}
                    ratioValue={ratioPercent(totalOriginal, totalCompressed)}
                    bad={totalCompressed > totalOriginal}
                  />
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
            totals={{
              count: doneItems.length,
              original: totalOriginal,
              compressed: totalCompressed,
            }}
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
