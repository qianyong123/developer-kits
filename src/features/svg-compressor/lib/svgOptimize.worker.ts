import { optimizeExtreme } from '@/features/svg-compressor/lib/extreme';
import { buildSvgoConfig } from '@/features/svg-compressor/lib/presets';
import { gzipSvgText } from '@/features/svg-compressor/lib/svgFile';
import type { OptimizeRequest, OptimizeResponse } from '@/features/svg-compressor/lib/workerProtocol';

// 避免引入 webworker lib 与 DOM lib 的全局冲突，Worker 作用域做最小化类型声明
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<OptimizeRequest>) => void) | null;
  postMessage: (response: OptimizeResponse) => void;
};

let svgoPromise: Promise<typeof import('svgo/browser')> | null = null;

scope.onmessage = async (event: MessageEvent<OptimizeRequest>) => {
  const { id, input, preset, format } = event.data;
  try {
    const { optimize } = await (svgoPromise ??= import('svgo/browser'));
    const text =
      preset === 'extreme'
        ? optimizeExtreme(input, optimize)
        : optimize(input, buildSvgoConfig(preset)).data;
    scope.postMessage({
      id,
      ok: true,
      result: {
        text,
        gzipped: format === 'svgz' ? gzipSvgText(text) : null,
      },
    });
  } catch (error) {
    scope.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
