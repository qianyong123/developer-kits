import { useCallback, useRef, useState } from 'react';
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
import CompareDialog from '@/features/image-compressor/components/CompareDialog';
import ImageCard from '@/features/image-compressor/components/ImageCard';
import SettingsPanel from '@/features/image-compressor/components/SettingsPanel';
import { compressImage } from '@/features/image-compressor/lib/compress';
import { outputFileName } from '@/features/image-compressor/lib/filenames';
import {
  DEFAULT_IMAGE_SETTINGS,
  useImageSettingsStore,
} from '@/features/image-compressor/stores';
import {
  MAX_FILE_SIZE,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
  readImageDimensions,
} from '@/features/image-compressor/lib/imageInfo';
import type { ImageItem } from '@/features/image-compressor/lib/types';
import { buildZipBlob } from '@/features/image-compressor/lib/zip';
import styles from '@/features/image-compressor/ImageCompressorPage.module.css';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALPHA_TYPES = new Set(['image/png', 'image/webp', 'image/gif']);
const CONCURRENCY = 2;
const MAX_FILES_PER_BATCH = 50;

const IMAGE_PICK_TYPES = [
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

let idCounter = 0;
const nextId = () => `img-${++idCounter}`;

function formatLabel(file: File): string {
  const map: Record<string, string> = {
    'image/gif': 'GIF',
    'image/bmp': 'BMP',
    'image/svg+xml': 'SVG',
    'image/avif': 'AVIF',
    'image/x-icon': 'ICO',
    'image/vnd.microsoft.icon': 'ICO',
    'image/tiff': 'TIFF',
  };
  if (map[file.type]) return map[file.type];
  const ext = file.name.split('.').pop()?.toUpperCase();
  return ext && ext.length <= 5 ? ext : '该图片';
}

function describeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  if (msg === 'no-webp') return messages.image.errorNoWebp;
  return messages.image.errorDecode;
}

export default function ImageCompressorPage() {
  const settings = useImageSettingsStore((s) => s.settings);
  const setSettings = useImageSettingsStore((s) => s.setSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [zipping, setZipping] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);

  const buildItems = useCallback(async (files: File[]) => {
    const notices: string[] = [];
    const supported = files.filter((f) => ALLOWED_TYPES.includes(f.type));
    const unsupported = files.filter((f) => !ALLOWED_TYPES.includes(f.type));

    // 支持格式：大小过滤
    const sizeOk = supported.filter((f) => f.size <= MAX_FILE_SIZE);
    if (sizeOk.length !== supported.length) notices.push(messages.image.fileTooLarge);

    // 支持格式：像素尺寸过滤
    let valid = sizeOk;
    if (valid.length > 0) {
      const dimOk: File[] = [];
      for (const f of sizeOk) {
        const dims = await readImageDimensions(f);
        const tooBig =
          dims &&
          (dims.width > MAX_IMAGE_SIDE ||
            dims.height > MAX_IMAGE_SIDE ||
            dims.width * dims.height > MAX_IMAGE_PIXELS);
        if (tooBig) continue;
        dimOk.push(f);
      }
      if (dimOk.length !== sizeOk.length) notices.push(messages.image.imageTooLarge);
      valid = dimOk;
    }

    const validWithAlpha = await Promise.all(
      valid.map(async (file) => ({
        file,
        hasTransparency: ALPHA_TYPES.has(file.type) ? await imageHasTransparency(file) : false,
      })),
    );

    const validItems: ImageItem[] = validWithAlpha.map(({ file, hasTransparency }) => ({
      id: nextId(),
      file,
      originalUrl: URL.createObjectURL(file),
      originalSize: file.size,
      hasTransparency,
      status: 'pending' as const,
    }));
    const created: ImageItem[] = [
      ...validItems,
      ...unsupported.map((file) => ({
        id: nextId(),
        file,
        originalUrl: URL.createObjectURL(file),
        originalSize: file.size,
        status: 'unsupported' as const,
        error: messages.image.unsupportedFormat(formatLabel(file)),
      })),
    ];
    return {
      created,
      compressIds: validItems.map((it) => it.id), // 只压缩新上传的图片
      notice: notices.length > 0 ? notices.join('；') : undefined,
    };
  }, []);

  const runTask = useCallback(
    async (item: ImageItem, onProgress?: (p: number) => void) =>
      compressImage(item.file, settingsRef.current, onProgress),
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
  } = useWorkbench<ImageItem>({
    maxItems: MAX_FILES_PER_BATCH,
    tooManyNotice: (n) => messages.image.fileCountExceeded(n),
    buildItems,
    runTask,
    errorMessage: describeError,
    concurrency: CONCURRENCY,
    withProgress: true,
    revokeResult: (result) => URL.revokeObjectURL(result.url),
  });

  // 设置变更：全部重新压缩（防抖）
  useDebouncedEffect(() => {
    recompressAll();
  }, [JSON.stringify(settings)], 300);

  const downloadOne = useCallback((item: ImageItem) => {
    if (!item.result) return;
    downloadUrl(item.result.url, outputFileName(item.file.name, item.result.format));
  }, []);

  const downloadAll = useCallback(async () => {
    const done = itemsRef.current.filter((it) => it.result);
    if (done.length === 0) return;

    setZipping(true);
    try {
      const entries = await Promise.all(
        done.map(async (it) => ({
          name: outputFileName(it.file.name, it.result!.format),
          blob: it.result!.blob,
        })),
      );
      const zipBlob = await buildZipBlob(entries);
      const url = URL.createObjectURL(zipBlob);
      downloadUrl(url, 'compressed-images.zip');
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } finally {
      setZipping(false);
    }
  }, [itemsRef]);

  const compareItem = items.find((it) => it.id === compareId && it.result) ?? null;
  const resultCount = items.filter((it) => it.result).length;
  const doneItems = items.filter((it) => it.result);
  const unsupportedCount = items.filter((it) => it.status === 'unsupported').length;
  const totalOriginal = doneItems.reduce((sum, it) => sum + it.originalSize, 0);
  const totalCompressed = doneItems.reduce((sum, it) => sum + (it.result?.size ?? 0), 0);
  const finishedCount = items.filter((it) => it.status === 'done' || it.status === 'error').length;
  const overallPct =
    items.length === 0
      ? 0
      : Math.round(
          (items.reduce((sum, it) => {
            if (it.status === 'done' || it.status === 'error') return sum + 1;
            if (it.status === 'processing') return sum + (it.progress ?? 0);
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
            <h1>{messages.image.title}</h1>
            <p className={styles.subtitle}>{messages.image.subtitle}</p>
          </div>
          <div className={styles.toolbar}>
            <button
              className="btn"
              disabled={busy || !items.some((it) => it.status !== 'unsupported')}
              onClick={() => void recompressAll()}
            >
              <RefreshIcon size={14} />
              {messages.image.recompress}
            </button>
            <button className="btn btn-ghost-danger" disabled={items.length === 0} onClick={clearAll}>
              <TrashIcon size={14} />
              {messages.image.clearAll}
            </button>
            <button
              className="btn btn-primary"
              disabled={zipping || resultCount === 0}
              onClick={() => void downloadAll()}
            >
              <DownloadIcon size={14} />
              {zipping ? messages.image.zipping : messages.image.downloadAll}
            </button>
          </div>
        </div>
      </header>

      <div className={styles.columns}>
        <div className={styles.mainCol}>
          <FileDropZone
            accept=".jpg, .jpeg, .png, .webp, .gif, .bmp, .svg, .avif, .ico, .tiff, .heic, .heif"
            pickTypes={IMAGE_PICK_TYPES}
            dragTitle={messages.image.dropTitle}
            tapTitle={messages.image.tapTitle}
            hint={messages.image.dropHint}
            features={[messages.image.featureLocal, messages.image.featureExif]}
            filter={(files) => files.filter((f) => f.type.startsWith('image/'))}
            onFiles={addFiles}
          />

          {notice && <Notice text={notice} onClose={() => setNotice(null)} />}

          <button
            className={styles.mobileSettingsToggle}
            onClick={() => setMobileSettingsOpen((v) => !v)}
            aria-expanded={mobileSettingsOpen}
          >
            {messages.image.settings}
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
                    processedLabel={messages.image.processed}
                    ofLabel={messages.image.of}
                  />
                )}
                {doneItems.length > 0 && (
                  <SummaryBar
                    summaryLabel={messages.image.summary}
                    count={doneItems.length}
                    countUnit={messages.image.images}
                    originalLabel={messages.image.original}
                    originalValue={formatBytes(totalOriginal)}
                    compressedLabel={messages.image.compressed}
                    compressedValue={formatBytes(totalCompressed)}
                    ratioLabel={messages.image.totalRatio}
                    ratioValue={ratioPercent(totalOriginal, totalCompressed)}
                    bad={totalCompressed > totalOriginal}
                    extra={
                      unsupportedCount > 0
                        ? ` · ${messages.image.unsupportedSummary(unsupportedCount)}`
                        : undefined
                    }
                  />
                )}
                <div className={styles.grid}>
                  {items.map((it) => (
                    <ImageCard
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
          <SettingsPanel
            settings={settings}
            onChange={setSettings}
  onReset={() => setSettings(DEFAULT_IMAGE_SETTINGS)}
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
        <CompareDialog
          item={compareItem}
          onClose={() => setCompareId(null)}
          previewBg={compareItem.hasTransparency ? 'checker' : 'white'}
        />
      )}
    </div>
  );
}
