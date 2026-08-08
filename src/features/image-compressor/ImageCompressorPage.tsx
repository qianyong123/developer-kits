import { useCallback, useEffect, useRef, useState } from 'react';
import { messages } from '../../shared/i18n/zh';
import { DownloadIcon, RefreshIcon, TrashIcon } from '../../shared/components/Icons';
import FileDropZone from '../../shared/components/FileDropZone/FileDropZone';
import { useDebouncedEffect } from '../../shared/hooks/useDebounced';
import { downloadUrl } from '../../shared/lib/download';
import { formatBytes, ratioPercent } from '../../shared/lib/format';
import { imageHasTransparency } from '../../shared/lib/hasTransparency';
import CompareDialog from './components/CompareDialog';
import ImageCard from './components/ImageCard';
import SettingsPanel from './components/SettingsPanel';
import { compressImage } from './lib/compress';
import { outputFileName } from './lib/filenames';
import { runPool } from './lib/queue';
import type { CompressSettings, ImageItem } from './lib/types';
import {
  MAX_FILE_SIZE,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
  readImageDimensions,
} from './lib/imageInfo';
import { buildZipBlob } from './lib/zip';
import styles from './ImageCompressorPage.module.css';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALPHA_TYPES = new Set(['image/png', 'image/webp', 'image/gif']);
const CONCURRENCY = 2;

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

const DEFAULT_SETTINGS: CompressSettings = {
  quality: 80,
  compressRatio: 100,
  format: 'original',
  keepMetadata: false,
  maxEdge: 4096,
};

function describeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  if (msg === 'no-webp') return messages.image.errorNoWebp;
  return messages.image.errorDecode;
}

export default function ImageCompressorPage() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [settings, setSettings] = useState<CompressSettings>(DEFAULT_SETTINGS);
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
  // 待压缩目标：null = 全部（设置变更/手动压缩），id 列表 = 仅新增的图片
  const compressTargetRef = useRef<string[] | null>(null);

  const updateItem = useCallback((id: string, patch: Partial<ImageItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const startCompress = useCallback(async (targetIds?: string[]) => {
    const current = itemsRef.current;
    const idSet = targetIds ? new Set(targetIds) : null;
    // 目标 = 指定 id（含正在进行中的项），未指定则为全部
    const targets = current.filter((it) => {
      if (it.status === 'unsupported') return false;
      if (!idSet) return true;
      return idSet.has(it.id) || it.status === 'pending' || it.status === 'processing';
    });
    if (targets.length === 0) return;
    const targetSet = new Set(targets.map((it) => it.id));

    const gen = ++genRef.current;
    // unsupported（如 SVG）保留在列表中，不参与压缩
    const snapshot = current.map((it) => {
      if (!targetSet.has(it.id)) return it;
      if (it.status === 'unsupported') return it;
      if (it.result) URL.revokeObjectURL(it.result.url);
      return { ...it, status: 'pending' as const, result: undefined, error: undefined, progress: undefined };
    });
    setItems(snapshot);
    setBusy(true);
    const runSettings = settingsRef.current;

    await runPool(
      targets,
      async (item) => {
        if (genRef.current !== gen) return;
        updateItem(item.id, { status: 'processing', progress: 0 });
        let lastReported = 0;
        try {
          const result = await compressImage(item.file, runSettings, (p) => {
            if (genRef.current !== gen) return;
            if (p - lastReported >= 0.05 || p >= 1) {
              lastReported = p;
              updateItem(item.id, { progress: p });
            }
          });
          if (genRef.current !== gen) return;
          updateItem(item.id, { status: 'done', result, progress: 1 });
        } catch (err) {
          if (genRef.current !== gen) return;
          updateItem(item.id, { status: 'error', error: describeError(err) });
        }
      },
      CONCURRENCY,
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

    if (notices.length > 0) setNotice(notices.join('；'));

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
    if (created.length === 0) return;
    setItems((prev) => [...created, ...prev]); // 最新上传的排在最前
    if (validItems.length > 0) {
      compressTargetRef.current = validItems.map((it) => it.id); // 只压缩新上传的图片
      setNeedCompress(true);
    }
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target) {
        URL.revokeObjectURL(target.originalUrl);
        if (target.result) URL.revokeObjectURL(target.result.url);
      }
      return prev.filter((it) => it.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    itemsRef.current.forEach((it) => {
      URL.revokeObjectURL(it.originalUrl);
      if (it.result) URL.revokeObjectURL(it.result.url);
    });
    genRef.current += 1; // 终止进行中的压缩
    setItems([]);
    setBusy(false);
  }, []);

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
  }, []);

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
              onClick={() => void startCompress()}
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

        {notice && (
          <div className={styles.notice}>
            <span>{notice}</span>
            <button className={styles.noticeClose} onClick={() => setNotice(null)}>
              ✕
            </button>
          </div>
        )}
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
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${overallPct}%` }} />
                    <span>
                      {messages.image.processed} {finishedCount} {messages.image.of} {items.length} ·{' '}
                      {overallPct}%
                    </span>
                  </div>
                )}
                {doneItems.length > 0 && (
                  <div className={styles.summary}>
                    <span>
                      {messages.image.summary} {doneItems.length} {messages.image.images} ·{' '}
                      {messages.image.original}: <b>{formatBytes(totalOriginal)}</b> ·{' '}
                      {messages.image.compressed}: <b>{formatBytes(totalCompressed)}</b> ·{' '}
                      {messages.image.totalRatio}:{' '}
                      <b
                        className={
                          totalCompressed > totalOriginal ? styles.summaryBad : styles.summaryGood
                        }
                      >
                        {ratioPercent(totalOriginal, totalCompressed)}
                      </b>
                      {unsupportedCount > 0 && (
                        <span className={styles.summaryUnsupported}>
                          {' · '}
                          {messages.image.unsupportedSummary(unsupportedCount)}
                        </span>
                      )}
                    </span>
                  </div>
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
            onReset={() => setSettings(DEFAULT_SETTINGS)}
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
