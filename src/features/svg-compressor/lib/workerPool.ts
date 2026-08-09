import type { SvgPreset } from '@/features/svg-compressor/lib/presets';
import type { OptimizeRequest, OptimizeResponse } from '@/features/svg-compressor/lib/workerProtocol';

interface PendingTask {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
}

interface QueuedTask extends PendingTask {
  input: string;
  preset: SvgPreset;
}

/** 固定并发数的 SVG 优化 Worker 池：任务排队、失败自动换新 Worker。 */
export class SvgWorkerPool {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly workerTask = new Map<Worker, number>();
  private readonly pending = new Map<number, PendingTask>();
  private readonly queue: QueuedTask[] = [];
  private nextId = 1;

  constructor(size: number) {
    for (let i = 0; i < size; i += 1) this.spawn();
  }

  run(input: string, preset: SvgPreset): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ input, preset, resolve, reject });
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
    const worker = new Worker(new URL('./svgOptimize.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<OptimizeResponse>) => {
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
      this.pending.set(id, { resolve: task.resolve, reject: task.reject });
      const request: OptimizeRequest = { id, input: task.input, preset: task.preset };
      worker.postMessage(request);
    }
  }

  private handleResponse(worker: Worker, response: OptimizeResponse): void {
    const task = this.pending.get(response.id);
    if (!task) return;
    this.pending.delete(response.id);
    this.workerTask.delete(worker);
    this.idle.push(worker);
    if (response.ok) task.resolve(response.text);
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
