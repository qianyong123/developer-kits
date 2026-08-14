import type {
  ImageCompressRequest,
  ImageCompressResponse,
  ImageWorkerResult,
} from '@/features/image-compressor/lib/imageWorkerProtocol';

interface PendingTask {
  resolve: (result: ImageWorkerResult) => void;
  reject: (error: Error) => void;
  onProgress?: (p: number) => void;
}

interface QueuedTask extends PendingTask {
  request: Omit<ImageCompressRequest, 'id'>;
}

/** 固定并发数的图片压缩 Worker 池：任务排队、失败自动换新 Worker。 */
export class ImageWorkerPool {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly workerTask = new Map<Worker, number>();
  private readonly pending = new Map<number, PendingTask>();
  private readonly queue: QueuedTask[] = [];
  private nextId = 1;

  constructor(size: number) {
    for (let i = 0; i < size; i += 1) this.spawn();
  }

  run(
    request: Omit<ImageCompressRequest, 'id'>,
    onProgress?: (p: number) => void,
  ): Promise<ImageWorkerResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject, onProgress });
      this.drain();
    });
  }

  dispose(): void {
    for (const worker of this.workers) worker.terminate();
    this.workers.length = 0;
    this.idle.length = 0;
    this.workerTask.clear();
    const error = new Error('worker-pool-disposed');
    for (const task of this.pending.values()) task.reject(error);
    this.pending.clear();
    for (const task of this.queue) task.reject(error);
    this.queue.length = 0;
  }

  private spawn(): void {
    const worker = new Worker(new URL('./imageCompress.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<ImageCompressResponse>) => {
      this.handleResponse(worker, event.data);
    };
    worker.onerror = () => {
      this.handleWorkerError(worker);
    };
    this.workers.push(worker);
    this.idle.push(worker);
  }

  private drain(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.pop()!;
      const task = this.queue.shift()!;
      const id = this.nextId;
      this.nextId += 1;
      this.workerTask.set(worker, id);
      this.pending.set(id, {
        resolve: task.resolve,
        reject: task.reject,
        onProgress: task.onProgress,
      });
      worker.postMessage({ ...task.request, id }, [task.request.bitmap]);
    }
  }

  private handleResponse(worker: Worker, response: ImageCompressResponse): void {
    if (response.kind === 'progress') {
      this.pending.get(response.id)?.onProgress?.(response.progress);
      return;
    }
    const task = this.pending.get(response.id);
    if (!task) return;
    this.pending.delete(response.id);
    this.workerTask.delete(worker);
    this.idle.push(worker);
    if (response.ok) task.resolve(response.result);
    else task.reject(new Error(response.error));
    this.drain();
  }

  private handleWorkerError(worker: Worker): void {
    const id = this.workerTask.get(worker);
    if (id !== undefined) {
      const task = this.pending.get(id);
      if (task) {
        this.pending.delete(id);
        task.reject(new Error('worker-error'));
      }
      this.workerTask.delete(worker);
    }
    const workerIndex = this.workers.indexOf(worker);
    if (workerIndex >= 0) this.workers.splice(workerIndex, 1);
    const idleIndex = this.idle.indexOf(worker);
    if (idleIndex >= 0) this.idle.splice(idleIndex, 1);
    worker.terminate();
    this.spawn();
  }
}

const POOL_SIZE = 2;
let pool: ImageWorkerPool | null = null;

export function getImageWorkerPool(): ImageWorkerPool {
  pool ??= new ImageWorkerPool(POOL_SIZE);
  return pool;
}

/** 页面卸载时释放 Worker，避免残留线程。 */
export function disposeImageWorkerPool(): void {
  pool?.dispose();
  pool = null;
}
