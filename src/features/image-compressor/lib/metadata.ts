export async function attachMetadataIfNeeded(
  blob: Blob,
  file: File,
  format: string,
  keep: boolean,
): Promise<{ blob: Blob; note?: string }> {
  if (!keep) return { blob };
  if (format !== 'jpeg') return { blob, note: 'metadata-unsupported' };

  try {
    const { default: piexif } = await import('piexifjs');
    // 原图本身不含 EXIF 时无需处理（也不提示）
    if (!(await hasExifMarker(file))) return { blob };
    const originalDataUrl = await blobToDataURL(file);

    let exif: Record<string, unknown> | null = null;
    try {
      exif = piexif.load(originalDataUrl);
    } catch {
      // 原图含 EXIF 但解析失败（部分手机/微信照片的非标准结构）
      return { blob, note: 'metadata-failed' };
    }
    if (!exif || !hasExif(exif)) return { blob };

    const compressedDataUrl = await blobToDataURL(blob);
    const withExif = piexif.insert(piexif.dump(exif), compressedDataUrl);
    return { blob: dataURLToBlob(withExif) };
  } catch {
    return { blob, note: 'metadata-failed' };
  }
}

/** 只读文件头（前 1MB）判断是否含 EXIF APP1 标记（"Exif\0\0"），避免误报解析失败。 */
async function hasExifMarker(file: File): Promise<boolean> {
  try {
    const head = new Uint8Array(await file.slice(0, Math.min(file.size, 1_048_576)).arrayBuffer());
    for (let i = 0; i + 5 < head.length; i += 1) {
      if (
        head[i] === 0x45 &&
        head[i + 1] === 0x78 &&
        head[i + 2] === 0x69 &&
        head[i + 3] === 0x66 &&
        head[i + 4] === 0x00 &&
        head[i + 5] === 0x00
      ) {
        return true;
      }
    }
  } catch {
    // 读取失败时按“无法判断”处理：仍走 piexif 解析
  }
  return true;
}

function hasExif(exif: Record<string, unknown>): boolean {
  return Object.values(exif).some(
    (value) => value && typeof value === 'object' && Object.keys(value as object).length > 0,
  );
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read-failed'));
    reader.readAsDataURL(blob);
  });
}

export function dataURLToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const meta = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const mime = /data:([^;]+);/.exec(meta)?.[1] ?? 'application/octet-stream';

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
