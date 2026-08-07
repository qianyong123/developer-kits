import { deflate } from 'pako';

/**
 * zlib 流压缩（PNG IDAT 需要的 zlib 格式）。
 * pako level 9：比浏览器 CompressionStream（约 level 6）压缩率更高，纯 JS 实现、无外部运行时。
 */
export async function deflateZlib(data: Uint8Array): Promise<Uint8Array> {
  return deflate(data, { level: 9 });
}
