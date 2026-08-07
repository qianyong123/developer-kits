import { useCallback, useEffect, useRef, useState } from 'react';
import { messages } from '../../shared/i18n/zh';
import { useDebouncedEffect } from '../../shared/hooks/useDebounced';
import { downloadUrl } from '../../shared/lib/download';
import { formatBytes, ratioPercent } from '../../shared/lib/format';
import CompareDialog from './components/CompareDialog';
import DropZone from './components/DropZone';
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
const CONCURRENCY = 2;
const MAX_ITEMS = 50;

let idCounter = 0;
const nextId = () => `img-${++idCounter}`;

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

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const genRef = useRef(0);

  const updateItem = useCallback((id: string, patch: Partial<ImageItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const startCompress = useCallback(async () => {
    const current = itemsRef.current;
    if (current.length === 0) return;

    const gen = ++genRef.current;
    const snapshot = current.map((it) => {
      if (it.result) URL.revokeObjectURL(it.result.url);
      return { ...it, status: 'pending' as const, result: undefined, error: undefined, progress: undefined };
    });
    setItems(snapshot);
    setBusy(true);
    const runSettings = settingsRef.current;

    await runPool(
      snapshot,
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
    void startCompress();
  }, [needCompress, startCompress]);

  useDebouncedEffect(
    () => {
      if (itemsRef.current.length > 0) setNeedCompress(true);
    },
    [JSON.stringify(settings)],
    300,
  );

  const addFiles = useCallback(async (files: File[]) => {
    const notices: string[] = [];

    // 数量限制：列表已有数量 + 本次新增不能超过上限
    const remaining = MAX_ITEMS - itemsRef.current.length;
    if (remaining <= 0) {
      setNotice(messages.image.maxItemsReached);
      return;
    }
    let pending = files;
    if (pending.length > remaining) {
      notices.push(messages.image.maxItemsIgnored(pending.length - remaining));
      pending = pending.slice(0, remaining);
    }

    const typeOk = pending.filter((f) => ALLOWED_TYPES.includes(f.type));
    const sizeOk = typeOk.filter((f) => f.size <= MAX_FILE_SIZE);

    if (pending.some((f) => f.type === 'image/gif')) notices.push(messages.image.gifUnsupported);
    if (pending.some((f) => f.type === 'image/bmp')) notices.push(messages.image.bmpUnsupported);
    if (typeOk.length !== pending.length) notices.push(messages.image.unsupportedIgnored);
    if (sizeOk.length !== typeOk.length) notices.push(messages.image.fileTooLarge);

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
    if (valid.length === 0) return;

    const created: ImageItem[] = valid.map((file) => ({
      id: nextId(),
      file,
      originalUrl: URL.createObjectURL(file),
      originalSize: file.size,
      status: 'pending',
    }));
    setItems((prev) => [...prev, ...created]);
    setNeedCompress(true);
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
        <h1>{messages.image.title}</h1>
        <p className={styles.subtitle}>{messages.image.subtitle}</p>

        {notice && (
          <div className={styles.notice}>
            <span>{notice}</span>
            <button className={styles.noticeClose} onClick={() => setNotice(null)}>
              ✕
            </button>
          </div>
        )}

        <div className={styles.toolbar}>
          <button className="btn" disabled={busy || items.length === 0} onClick={() => void startCompress()}>
            {messages.image.recompress}
          </button>
          <button
            className="btn btn-primary"
            disabled={zipping || resultCount === 0}
            onClick={() => void downloadAll()}
          >
            {zipping ? messages.image.zipping : messages.image.downloadAll}
          </button>
          <button className="btn btn-ghost-danger" disabled={items.length === 0} onClick={clearAll}>
            {messages.image.clearAll}
          </button>
        </div>
      </header>

      <DropZone onFiles={addFiles} />

      <button
        className={styles.mobileSettingsToggle}
        onClick={() => setMobileSettingsOpen((v) => !v)}
        aria-expanded={mobileSettingsOpen}
      >
        {messages.image.settings}
        {busy ? ` · ${overallPct}%` : ''}
      </button>

      <div className={styles.body}>
        <aside className={`${styles.settings} ${mobileSettingsOpen ? styles.settingsOpen : ''}`}>
          <SettingsPanel settings={settings} onChange={setSettings} />
        </aside>

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
                  </span>
                </div>
              )}
              <div className={styles.grid}>
                {items.map((it) => (
                  <ImageCard
                    key={it.id}
                    item={it}
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

      {compareItem && <CompareDialog item={compareItem} onClose={() => setCompareId(null)} />}
    </div>
  );
}
