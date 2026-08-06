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
    const originalDataUrl = await blobToDataURL(file);

    let exif: Record<string, unknown> | null = null;
    try {
      exif = piexif.load(originalDataUrl);
    } catch {
      exif = null;
    }
    if (!exif || !hasExif(exif)) return { blob };

    const compressedDataUrl = await blobToDataURL(blob);
    const withExif = piexif.insert(piexif.dump(exif), compressedDataUrl);
    return { blob: dataURLToBlob(withExif) };
  } catch {
    return { blob };
  }
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
