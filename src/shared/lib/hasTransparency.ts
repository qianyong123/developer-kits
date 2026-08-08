export type PreviewBg = 'white' | 'checker';

/**
 * 检测图片/SVG 是否含透明像素：缩小采样后扫描 alpha 通道。
 * 仅用于预览背景选择，JPEG 等无 alpha 格式可直接返回 false。
 */
export async function imageHasTransparency(blob: Blob, sampleSize = 96): Promise<boolean> {
  const canvas = await decodeScaled(blob, sampleSize);
  if (!canvas) return false;
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
    return false;
  } catch {
    // 画布被污染（SVG 引用外部资源）或读取失败：按不透明处理，使用白色背景
    return false;
  }
}

/** 把 Blob 解码并缩小到采样尺寸；位图优先，SVG 回退到 <img>（createImageBitmap 不支持 SVG）。 */
async function decodeScaled(blob: Blob, sampleSize: number): Promise<HTMLCanvasElement | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    try {
      return scaleToCanvas(
        bitmap.width,
        bitmap.height,
        (ctx, width, height) => {
          ctx.drawImage(bitmap, 0, 0, width, height);
        },
        sampleSize,
      );
    } finally {
      bitmap.close();
    }
  } catch {
    return loadViaImage(blob, sampleSize);
  }
}

function scaleToCanvas(
  sourceWidth: number,
  sourceHeight: number,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  sampleSize: number,
): HTMLCanvasElement | null {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    return null;
  }
  const scale = Math.min(1, sampleSize / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  draw(ctx, width, height);
  return canvas;
}

function loadViaImage(blob: Blob, sampleSize: number): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(
        scaleToCanvas(
          img.naturalWidth,
          img.naturalHeight,
          (ctx, width, height) => {
            ctx.drawImage(img, 0, 0, width, height);
          },
          sampleSize,
        ),
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
