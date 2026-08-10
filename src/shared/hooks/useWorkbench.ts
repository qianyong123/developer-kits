import { useCallback, useEffect, useRef, useState } from 'react';
import { runPool } from '@/shared/lib/queue';

export type WorkbenchStatus = 'pending' | 'processing' | 'done' | 'error' | 'unsupported';

export interface WorkbenchItem {
  id: string;
  originalUrl: string;
  status: WorkbenchStatus;
  /** 各工具自定义的压缩结果（如 CompressResult / SvgResult） */
  result?: unknown;
  error?: string;
  progress?: number;
}

export interface WorkbenchOptions<T extends WorkbenchItem> {
  /** 列表数量上限；0 表示不限制 */
  maxItems?: number;
  /** 超出上限时被忽略文件数的提示文案 */
  tooManyNotice?: (ignored: number) => string;
  /** 将截取后的文件构建为条目；返回新增条目与需要自动压缩的条目 id */
  buildItems: (
    files: File[],
    remaining: number,
  ) => Promise<{ created: T[]; compressIds: string[]; notice?: string }>;
  /** 执行单个压缩任务，返回结果（由工作台写入 item.result） */
  runTask: (item: T, onProgress?: (progress: number) => void) => Promise<T['result'] | undefined>;
  /** 任务失败时的展示文案 */
  errorMessage?: (err: unknown) => string;
  /** 并发数；0 表示不限制（Promise.all，Worker 池自控并发时用） */
  concurrency?: number;
  /** 是否上报进度（量化等耗时任务） */
  withProgress?: boolean;
  /** 释放条目结果占用的对象 URL */
  revokeResult?: (result: NonNullable<T['result']>, item: T) => void;
}

/**
 * 处理工作台：统一管理文件列表（增删/清空/上限/提示）、
 * 压缩流水线（并发/进度/取消/设置变更重跑）与自动压缩调度。
 * 图片压缩与 SVG 压缩两个页面共用，新增队列型工具可直接复用。
 * 列表为页面级状态：切走工具即清空；设置等公共数据走 zustand store。
 */
export function useWorkbench<T extends WorkbenchItem>(options: WorkbenchOptions<T>) {
  const {
    maxItems = 0,
    tooManyNotice,
    buildItems,
    runTask,
    errorMessage = (err) => (err instanceof Error ? err.message : String(err)),
    concurrency = 2,
    withProgress = false,
    revokeResult,
  } = options;

  const [items, setItems] = useState<T[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const genRef = useRef(0);
  // 待压缩目标：null = 全部（设置变更/手动压缩），id 列表 = 仅新增的条目
  const compressTargetRef = useRef<string[] | null>(null);
  const [needCompress, setNeedCompress] = useState(false);

  const updateItem = useCallback((id: string, patch: Partial<WorkbenchItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? ({ ...it, ...patch } as T) : it)),
    );
  }, []);

  const startCompress = useCallback(
    async (targetIds?: string[]) => {
      const current = itemsRef.current;
      const idSet = targetIds ? new Set(targetIds) : null;
      // 目标 = 指定 id（含进行中的项）；未指定则为全部（unsupported 除外）
      const targets = current.filter((it) => {
        if (it.status === 'unsupported') return false;
        if (!idSet) return true;
        return idSet.has(it.id) || it.status === 'pending' || it.status === 'processing';
      });
      if (targets.length === 0) return;
      const targetSet = new Set(targets.map((it) => it.id));

      const gen = ++genRef.current;
      // unsupported 条目保留在列表中，不参与压缩
      const snapshot = current.map((it) => {
        if (!targetSet.has(it.id) || it.status === 'unsupported') return it;
        if (it.result && revokeResult) revokeResult(it.result, it);
        return {
          ...it,
          status: 'pending' as const,
          result: undefined,
          error: undefined,
          progress: undefined,
        };
      });
      setItems(snapshot);
      setBusy(true);

      const run = async (item: T) => {
        if (genRef.current !== gen) return;
        updateItem(item.id, {
          status: 'processing',
          ...(withProgress ? { progress: 0 } : {}),
        });
        let lastReported = 0;
        try {
          const result = await runTask(
            item,
            withProgress
              ? (p: number) => {
                  if (genRef.current !== gen) return;
                  // 节流：至少 5% 才刷新，避免高频重渲染
                  if (p - lastReported >= 0.05 || p >= 1) {
                    lastReported = p;
                    updateItem(item.id, { progress: p });
                  }
                }
              : undefined,
          );
          if (genRef.current !== gen) return;
          updateItem(item.id, {
            status: 'done',
            result,
            ...(withProgress ? { progress: 1 } : {}),
          });
        } catch (err) {
          if (genRef.current !== gen) return;
          updateItem(item.id, { status: 'error', error: errorMessage(err) });
        }
      };

      if (concurrency > 1) await runPool(targets, run, concurrency);
      else await Promise.all(targets.map(run));

      if (genRef.current === gen) setBusy(false);
    },
    [updateItem, runTask, errorMessage, concurrency, withProgress, revokeResult],
  );

  // 新增条目 / 手动触发后自动压缩
  useEffect(() => {
    if (!needCompress) return;
    setNeedCompress(false);
    const target = compressTargetRef.current;
    compressTargetRef.current = null;
    void startCompress(target ?? undefined);
  }, [needCompress, startCompress]);

  const addFiles = useCallback(
    async (files: File[]) => {
      const remaining =
        maxItems > 0 ? Math.max(0, maxItems - itemsRef.current.length) : files.length;
      const taken = files.slice(0, remaining);
      const ignored = files.length - taken.length;
      const { created, compressIds, notice: buildNotice } = await buildItems(taken, remaining);
      const notices: string[] = [];
      if (ignored > 0 && tooManyNotice) notices.push(tooManyNotice(ignored));
      if (buildNotice) notices.push(buildNotice);
      if (created.length > 0) {
        setItems((prev) => [...created, ...prev]); // 最新上传的排在最前
        if (compressIds.length > 0) {
          compressTargetRef.current = compressIds; // 只压缩新上传的条目
          setNeedCompress(true);
        }
      }
      setNotice(notices.length > 0 ? notices.join('；') : null);
    },
    [maxItems, tooManyNotice, buildItems],
  );

  const removeItem = useCallback(
    (id: string) => {
      const target = itemsRef.current.find((it) => it.id === id);
      if (target) {
        URL.revokeObjectURL(target.originalUrl);
        if (target.result && revokeResult) revokeResult(target.result, target);
      }
      const next = itemsRef.current.filter((it) => it.id !== id);
      // 删除后数量低于上限时，关闭上限相关提示
      if (maxItems > 0 && next.length < maxItems) setNotice(null);
      setItems(next);
    },
    [maxItems, revokeResult],
  );

  const clearAll = useCallback(() => {
    itemsRef.current.forEach((it) => {
      URL.revokeObjectURL(it.originalUrl);
      if (it.result && revokeResult) revokeResult(it.result, it);
    });
    genRef.current += 1; // 终止进行中的压缩
    setItems([]);
    setBusy(false);
    setNotice(null);
  }, [revokeResult]);

  const recompressAll = useCallback(() => {
    if (itemsRef.current.length === 0) return;
    compressTargetRef.current = null; // 设置变更：全部重新压缩
    setNeedCompress(true);
  }, []);

  return {
    items,
    itemsRef,
    busy,
    notice,
    setNotice,
    addFiles,
    removeItem,
    clearAll,
    recompressAll,
  };
}
