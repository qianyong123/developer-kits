import { zipSync } from 'fflate';

export async function buildZipBlob(files: Array<{ name: string; blob: Blob }>): Promise<Blob> {
  const used = new Set<string>();
  const entries: Record<string, Uint8Array> = {};

  for (const { name, blob } of files) {
    entries[uniqueName(name, used)] = new Uint8Array(await blob.arrayBuffer());
  }

  // 图片本身已是压缩数据，ZIP 层使用存储模式（level 0），速度最快
  const zipped = zipSync(entries, { level: 0 });
  return new Blob([zipped], { type: 'application/zip' });
}

function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }

  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let i = 1;
  let candidate = `${base} (${i})${ext}`;
  while (used.has(candidate)) {
    i += 1;
    candidate = `${base} (${i})${ext}`;
  }
  used.add(candidate);
  return candidate;
}
