/** PNG 有损量化：4D（预乘 alpha）中位切分 + k-means 精修 + 自适应抖动 + 索引色 PNG 编码。 */

import { deflateZlib } from './deflate';

export interface QuantizeOptions {
  /** 调色板颜色数（不含透明项），2..256 */
  colors: number;
  /** 抖动强度 0..1 */
  dither: number;
  /** 是否允许自适应颜色缩减（保真优先模式下关闭） */
  adaptive?: boolean;
}

/** PNG 输出使用的默认抖动强度。 */
export const PNG_DITHER = 0.6;

/** 自适应抖动：局部颜色范围超过该阈值视为边缘/噪点，不扩散误差。 */
const EDGE_THRESHOLD = 64;

// 直方图：RGB 各 4 bit（0-15）+ alpha 5 bit（0-31），预乘空间
const R_BINS = 16;
const G_BINS = 16;
const B_BINS = 16;
const A_BINS = 32;
const BIN_COUNT = R_BINS * G_BINS * B_BINS * A_BINS;
const R_STRIDE = G_BINS * B_BINS * A_BINS; // 8192
const G_STRIDE = B_BINS * A_BINS; // 512
const B_STRIDE = A_BINS; // 32

// 4D 前缀和（每维多一格，用于 O(1) 求箱内像素数）
const PR_STRIDE = (G_BINS + 1) * (B_BINS + 1) * (A_BINS + 1);
const PG_STRIDE = (B_BINS + 1) * (A_BINS + 1);
const PB_STRIDE = A_BINS + 1;
const PREFIX_SIZE = (R_BINS + 1) * (G_BINS + 1) * (B_BINS + 1) * (A_BINS + 1);

type Rgba = [number, number, number, number];

interface Box {
  min: [number, number, number, number];
  max: [number, number, number, number];
  count: number;
}

/** 质量值（1..100）映射为调色板颜色数（16..256）。 */
export function qualityToPngColors(quality: number): number {
  const q = Math.max(1, Math.min(100, quality));
  return Math.round(16 + ((q - 1) / 99) * 240);
}

function binIndex(r4: number, g4: number, b4: number, a5: number): number {
  return r4 * R_STRIDE + g4 * G_STRIDE + b4 * B_STRIDE + a5;
}

export async function quantizeRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  opts: QuantizeOptions,
  onProgress?: (p: number) => void,
): Promise<{ blob: Blob; paletteSize: number }> {
  const pixelCount = width * height;
  const maxColors = Math.max(2, Math.min(256, Math.round(opts.colors)));
  const dither = Math.max(0, Math.min(1, opts.dither));

  // 1) 预乘 alpha 的 4D 直方图（RGB 4bit + alpha 5bit）
  const count = new Float64Array(BIN_COUNT);
  const sumPR = new Float64Array(BIN_COUNT);
  const sumPG = new Float64Array(BIN_COUNT);
  const sumPB = new Float64Array(BIN_COUNT);
  const sumA = new Float64Array(BIN_COUNT);

  const sampleStride = Math.max(1, Math.floor(pixelCount / 100_000));
  const sampleColors = new Int32Array(Math.min(pixelCount, 120_000));
  let sampleIndex = 0;
  const histogramChunk = Math.max(1 << 20, sampleStride * 4);
  onProgress?.(0.02);
  for (let start = 0; start < pixelCount; start += histogramChunk) {
    const end = Math.min(pixelCount, start + histogramChunk);
    for (let i = start; i < end; i++) {
      const o = i * 4;
      const r = rgba[o];
      const g = rgba[o + 1];
      const b = rgba[o + 2];
      const a = rgba[o + 3];
      if (i % sampleStride === 0 && sampleIndex < sampleColors.length) {
        sampleColors[sampleIndex++] = (r << 24) | (g << 16) | (b << 8) | a;
      }
      // 全透明像素统一并入 (0,0,0,0) 箱，避免透明背景抢占调色板
      const bin = a === 0 ? 0 : binIndex(r >> 4, g >> 4, b >> 4, a >> 3);
      count[bin] += 1;
      sumPR[bin] += r;
      sumPG[bin] += g;
      sumPB[bin] += b;
      sumA[bin] += a;
    }
    onProgress?.(0.02 + 0.3 * (end / pixelCount));
    if (end < pixelCount) await yieldToUI();
  }

  onProgress?.(0.34);
  const prefix = buildPrefixCount(count);
  const entries = refinePaletteKmeans(
    medianCutPalette(prefix, count, sumPR, sumPG, sumPB, sumA, maxColors),
    sampleColors,
    sampleIndex,
  );
  const colorEntries =
    opts.adaptive === false
      ? entries
      : adaptPaletteSize(entries, prefix, count, sumPR, sumPG, sumPB, sumA, sampleColors, sampleIndex);

  const palette: Rgba[] = colorEntries.length > 0 ? colorEntries : [[0, 0, 0, 0]];
  onProgress?.(0.4);

  const tree = buildKdTree(palette);
  const indices = await mapPixels(rgba, width, height, tree, dither, (p) =>
    onProgress?.(0.4 + p * 0.42),
  );

  const blob = await encodeIndexedPng(width, height, palette, indices, (p) => onProgress?.(0.82 + p * 0.16));
  onProgress?.(1);
  return { blob, paletteSize: palette.length };
}

function buildPrefixCount(count: Float64Array): Float64Array {
  const p = new Float64Array(PREFIX_SIZE);
  for (let r = 0; r < R_BINS; r++) {
    for (let g = 0; g < G_BINS; g++) {
      for (let b = 0; b < B_BINS; b++) {
        for (let a = 0; a < A_BINS; a++) {
          const src = binIndex(r, g, b, a);
          const dst = (r + 1) * PR_STRIDE + (g + 1) * PG_STRIDE + (b + 1) * PB_STRIDE + (a + 1);
          p[dst] = count[src];
          for (let mask = 1; mask < 16; mask++) {
            let off = 0;
            let bits = 0;
            if (mask & 1) {
              off += PR_STRIDE;
              bits += 1;
            }
            if (mask & 2) {
              off += PG_STRIDE;
              bits += 1;
            }
            if (mask & 4) {
              off += PB_STRIDE;
              bits += 1;
            }
            if (mask & 8) {
              off += 1;
              bits += 1;
            }
            p[dst] += (bits % 2 === 1 ? 1 : -1) * p[dst - off];
          }
        }
      }
    }
  }
  return p;
}

function countRegion(p: Float64Array, min: Box['min'], max: Box['max']): number {
  let total = 0;
  for (let mask = 0; mask < 16; mask++) {
    let idx = 0;
    let bits = 0;
    idx += (mask & 1 ? max[0] + 1 : min[0]) * PR_STRIDE;
    idx += (mask & 2 ? max[1] + 1 : min[1]) * PG_STRIDE;
    idx += (mask & 4 ? max[2] + 1 : min[2]) * PB_STRIDE;
    idx += mask & 8 ? max[3] + 1 : min[3];
    bits = (mask & 1 ? 1 : 0) + (mask & 2 ? 1 : 0) + (mask & 4 ? 1 : 0) + (mask & 8 ? 1 : 0);
    total += bits % 2 === 0 ? p[idx] : -p[idx];
  }
  return total;
}

function medianCutPalette(
  prefix: Float64Array,
  count: Float64Array,
  sumPR: Float64Array,
  sumPG: Float64Array,
  sumPB: Float64Array,
  sumA: Float64Array,
  maxColors: number,
): Rgba[] {
  const initial = boundingBox(count);
  if (initial.count === 0) return [];

  const boxes: Box[] = [initial];
  while (boxes.length < maxColors) {
    let target = -1;
    let best = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].count <= 1) continue;
      const range = boxRange(boxes[i]);
      if (range > best) {
        best = range;
        target = i;
      }
    }
    if (target === -1) break;

    const box = boxes[target];
    const ranges = [
      box.max[0] - box.min[0],
      box.max[1] - box.min[1],
      box.max[2] - box.min[2],
      box.max[3] - box.min[3],
    ];
    const channels = [0, 1, 2, 3].sort((a, b) => ranges[b] - ranges[a]);

    let split = false;
    for (const ch of channels) {
      let splitAt = medianSplit(box, ch, prefix);
      // 中位数可能落在箱子的最末 bin（大块同色背景堆在 max），导致右半区为空；
      // 也可能落在最前 bin（透明/同色占多数，堆在 min）。先直接尝试切分，
      // 右侧为空时再把切分点向左移动，直到两侧都有像素，避免调色板塌缩成单一背景色。
      for (;;) {
        const b1: Box = { min: [...box.min], max: [...box.max], count: 0 };
        const b2: Box = { min: [...box.min], max: [...box.max], count: 0 };
        b1.max[ch] = splitAt;
        b2.min[ch] = splitAt + 1;
        b1.count = countRegion(prefix, b1.min, b1.max);
        b2.count = countRegion(prefix, b2.min, b2.max);
        if (b1.count > 0 && b2.count > 0) {
          boxes.splice(target, 1, b1, b2);
          split = true;
          break;
        }
        if (splitAt <= box.min[ch]) break;
        splitAt -= 1;
      }
      if (split) break;
    }
    if (split) continue;
    // 所有通道都切不开：该箱只有一个有效 bin，标记为不可再分
    box.count = 1;
  }

  const entries: Rgba[] = [];
  for (const box of boxes) {
    if (box.count <= 0) continue;
    let pr = 0;
    let pg = 0;
    let pb = 0;
    let sa = 0;
    let n = 0;
    for (let r = box.min[0]; r <= box.max[0]; r++) {
      for (let g = box.min[1]; g <= box.max[1]; g++) {
        for (let b = box.min[2]; b <= box.max[2]; b++) {
          for (let a = box.min[3]; a <= box.max[3]; a++) {
            const bin = binIndex(r, g, b, a);
            const c = count[bin];
            if (c > 0) {
              pr += sumPR[bin];
              pg += sumPG[bin];
              pb += sumPB[bin];
              sa += sumA[bin];
              n += c;
            }
          }
        }
      }
    }
    if (n > 0) {
      // 直通空间均值（保留半透明颜色亮度）
      const alpha = sa / n;
      entries.push([
        n > 0 ? Math.round(pr / n) : 0,
        n > 0 ? Math.round(pg / n) : 0,
        n > 0 ? Math.round(pb / n) : 0,
        Math.round(alpha),
      ]);
    }
  }
  return entries;
}

function boundingBox(count: Float64Array): Box {
  let min0 = 15;
  let max0 = 0;
  let min1 = 15;
  let max1 = 0;
  let min2 = 15;
  let max2 = 0;
  let min3 = 31;
  let max3 = 0;
  let total = 0;
  for (let bin = 0; bin < BIN_COUNT; bin++) {
    const c = count[bin];
    if (c <= 0) continue;
    const r = (bin >> 13) & 15;
    const g = (bin >> 9) & 15;
    const b = (bin >> 5) & 15;
    const a = bin & 31;
    if (r < min0) min0 = r;
    if (r > max0) max0 = r;
    if (g < min1) min1 = g;
    if (g > max1) max1 = g;
    if (b < min2) min2 = b;
    if (b > max2) max2 = b;
    if (a < min3) min3 = a;
    if (a > max3) max3 = a;
    total += c;
  }
  return { min: [min0, min1, min2, min3], max: [max0, max1, max2, max3], count: total };
}

function boxRange(box: Box): number {
  return Math.max(
    box.max[0] - box.min[0],
    box.max[1] - box.min[1],
    box.max[2] - box.min[2],
    box.max[3] - box.min[3],
  );
}

function medianSplit(box: Box, ch: number, prefix: Float64Array): number {
  const half = box.count / 2;
  let acc = 0;
  for (let v = box.min[ch]; v <= box.max[ch]; v++) {
    const min: Box['min'] = [...box.min];
    const max: Box['max'] = [...box.max];
    min[ch] = v;
    max[ch] = v;
    acc += countRegion(prefix, min, max);
    if (acc >= half) return v;
  }
  return box.max[ch];
}

/** k-means 精修：在采样像素（直通 RGBA）上迭代，kd-tree 加速最近中心查找。 */
function refinePaletteKmeans(
  entries: Rgba[],
  samples: Int32Array,
  sampleCount: number,
  iterations = 4,
): Rgba[] {
  if (sampleCount === 0 || entries.length <= 1) return entries;
  let centers = entries;

  for (let iter = 0; iter < iterations; iter++) {
    const tree = buildKdTree(centers);
    const sumRA = new Float64Array(centers.length);
    const sumGA = new Float64Array(centers.length);
    const sumBA = new Float64Array(centers.length);
    const sumAA = new Float64Array(centers.length);
    const counts = new Array<number>(centers.length).fill(0);

    for (let i = 0; i < sampleCount; i++) {
      const packed = samples[i];
      const r = (packed >>> 24) & 0xff;
      const g = (packed >>> 16) & 0xff;
      const b = (packed >>> 8) & 0xff;
      const a = packed & 0xff;
      const idx = nearestKd(tree, r, g, b, a);
      sumRA[idx] += r;
      sumGA[idx] += g;
      sumBA[idx] += b;
      sumAA[idx] += a;
      counts[idx] += 1;
    }

    let moved = 0;
    const next: Rgba[] = [];
    for (let k = 0; k < centers.length; k++) {
      if (counts[k] === 0) continue;
      const alpha = sumAA[k] / counts[k];
      next.push([
        Math.round(sumRA[k] / counts[k]),
        Math.round(sumGA[k] / counts[k]),
        Math.round(sumBA[k] / counts[k]),
        Math.round(alpha),
      ]);
      const dr = next[next.length - 1][0] - centers[k][0];
      const dg = next[next.length - 1][1] - centers[k][1];
      const db = next[next.length - 1][2] - centers[k][2];
      const da = next[next.length - 1][3] - centers[k][3];
      if (dr * dr + dg * dg + db * db + da * da > 0.5) moved += 1;
    }
    if (next.length === 0) break;
    centers = next;
    if (moved === 0) break;
  }
  return centers;
}

/**
 * 自适应颜色数：画面比较简单（量化误差很小）时，尝试用一半颜色重建调色板；
 * 若误差没有明显恶化就采用更小的调色板（扁平图自动变小，照片类不受影响）。
 */
function adaptPaletteSize(
  entries: Rgba[],
  prefix: Float64Array,
  count: Float64Array,
  sumPR: Float64Array,
  sumPG: Float64Array,
  sumPB: Float64Array,
  sumA: Float64Array,
  samples: Int32Array,
  sampleCount: number,
): Rgba[] {
  if (entries.length <= 4 || sampleCount === 0) return entries;

  const mseFull = estimatePaletteMse(samples, sampleCount, buildKdTree(entries));
  if (mseFull > 120) return entries;

  const half = Math.max(4, Math.floor(entries.length / 2));
  const halfEntries = refinePaletteKmeans(
    medianCutPalette(prefix, count, sumPR, sumPG, sumPB, sumA, half),
    samples,
    sampleCount,
  );
  if (halfEntries.length >= entries.length) return entries;

  const mseHalf = estimatePaletteMse(samples, sampleCount, buildKdTree(halfEntries));
  if (mseHalf <= Math.max(160, mseFull * 1.15)) return halfEntries;
  return entries;
}

/** 在采样像素上估计调色板映射的均方误差（直通空间）。 */
function estimatePaletteMse(samples: Int32Array, sampleCount: number, tree: KdTree): number {
  let sum = 0;
  for (let i = 0; i < sampleCount; i++) {
    const packed = samples[i];
    const r = (packed >>> 24) & 0xff;
    const g = (packed >>> 16) & 0xff;
    const b = (packed >>> 8) & 0xff;
    const a = packed & 0xff;
    const qx = r;
    const qy = g;
    const qz = b;
    const idx = nearestKd(tree, qx, qy, qz, a);
    const coords = tree.coords;
    const dx = qx - coords[idx * 4];
    const dy = qy - coords[idx * 4 + 1];
    const dz = qz - coords[idx * 4 + 2];
    const da = a - coords[idx * 4 + 3];
    sum += dx * dx + dy * dy + dz * dz + da * da;
  }
  return sampleCount > 0 ? sum / sampleCount : 0;
}

// ---------- kd-tree（4D 直通空间最近邻） ----------

interface KdNode {
  index: number;
  dim: number;
  left: KdNode | null;
  right: KdNode | null;
}

interface KdTree {
  coords: Float64Array;
  root: KdNode | null;
}

function buildKdTree(palette: Rgba[]): KdTree {
  const n = palette.length;
  const coords = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) {
    const [r, g, b, a] = palette[i];
    coords[i * 4] = r;
    coords[i * 4 + 1] = g;
    coords[i * 4 + 2] = b;
    coords[i * 4 + 3] = a;
  }
  const indices = Array.from({ length: n }, (_, i) => i);
  return { coords, root: buildNode(coords, indices) };
}

function buildNode(coords: Float64Array, indices: number[]): KdNode | null {
  if (indices.length === 0) return null;
  if (indices.length === 1) return { index: indices[0], dim: 0, left: null, right: null };

  let min0 = Infinity;
  let max0 = -Infinity;
  let min1 = Infinity;
  let max1 = -Infinity;
  let min2 = Infinity;
  let max2 = -Infinity;
  let min3 = Infinity;
  let max3 = -Infinity;
  for (const i of indices) {
    const x0 = coords[i * 4];
    const x1 = coords[i * 4 + 1];
    const x2 = coords[i * 4 + 2];
    const x3 = coords[i * 4 + 3];
    if (x0 < min0) min0 = x0;
    if (x0 > max0) max0 = x0;
    if (x1 < min1) min1 = x1;
    if (x1 > max1) max1 = x1;
    if (x2 < min2) min2 = x2;
    if (x2 > max2) max2 = x2;
    if (x3 < min3) min3 = x3;
    if (x3 > max3) max3 = x3;
  }
  const spans = [max0 - min0, max1 - min1, max2 - min2, max3 - min3];
  let dim = 0;
  for (let d = 1; d < 4; d++) {
    if (spans[d] > spans[dim]) dim = d;
  }

  indices.sort((a, b) => coords[a * 4 + dim] - coords[b * 4 + dim]);
  const mid = Math.floor(indices.length / 2);
  return {
    index: indices[mid],
    dim,
    left: buildNode(coords, indices.slice(0, mid)),
    right: buildNode(coords, indices.slice(mid + 1)),
  };
}

function nearestKd(tree: KdTree, qx: number, qy: number, qz: number, qa: number): number {
  const { coords, root } = tree;
  let best = root ? root.index : 0;
  let bestDist = Infinity;

  const search = (node: KdNode | null): void => {
    if (!node) return;
    const i = node.index;
    const dx = qx - coords[i * 4];
    const dy = qy - coords[i * 4 + 1];
    const dz = qz - coords[i * 4 + 2];
    const da = qa - coords[i * 4 + 3];
    const dist = dx * dx + dy * dy + dz * dz + da * da;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }

    const dim = node.dim;
    const nodeV = coords[i * 4 + dim];
    const qv = dim === 0 ? qx : dim === 1 ? qy : dim === 2 ? qz : qa;
    let near: KdNode | null;
    let far: KdNode | null;
    if (qv < nodeV) {
      near = node.left;
      far = node.right;
    } else {
      near = node.right;
      far = node.left;
    }
    search(near);
    const plane = qv - nodeV;
    if (plane * plane < bestDist) search(far);
  };

  search(root);
  return best;
}

// ---------- 像素映射与抖动 ----------

async function mapPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  tree: KdTree,
  dither: number,
  onProgress?: (p: number) => void,
): Promise<Uint8Array> {
  const pixelCount = width * height;
  const indices = new Uint8Array(pixelCount);
  const chunkRows = 64;

  // 无抖动：直接最近色查询
  if (dither <= 0) {
    for (let y = 0; y < height; y += chunkRows) {
      const endY = Math.min(height, y + chunkRows);
      for (let yy = y; yy < endY; yy++) {
        const row = yy * width;
        for (let x = 0; x < width; x++) {
          const i = row + x;
          const o = i * 4;
          const a = rgba[o + 3];
          indices[i] = nearestKd(tree, rgba[o], rgba[o + 1], rgba[o + 2], a);
        }
      }
      onProgress?.(Math.min(1, (y + chunkRows) / height));
      if (endY < height) await yieldToUI();
    }
    return indices;
  }

  // 抖动：直通空间 4 通道 Floyd–Steinberg（两行环形误差缓冲）
  const errR = new Float32Array(width * 2);
  const errG = new Float32Array(width * 2);
  const errB = new Float32Array(width * 2);
  const errA = new Float32Array(width * 2);
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
  const coords = tree.coords;

  for (let y = 0; y < height; y++) {
    const cur = y & 1;
    const next = cur ^ 1;
    for (let x = 0; x < width; x++) {
      errR[next * width + x] = 0;
      errG[next * width + x] = 0;
      errB[next * width + x] = 0;
      errA[next * width + x] = 0;
    }
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = i * 4;
      const a0 = rgba[o + 3];
      const a = clamp(Math.round(a0 + errA[cur * width + x]));
      const qx = clamp(Math.round(rgba[o] + errR[cur * width + x]));
      const qy = clamp(Math.round(rgba[o + 1] + errG[cur * width + x]));
      const qz = clamp(Math.round(rgba[o + 2] + errB[cur * width + x]));
      const idx = nearestKd(tree, qx, qy, qz, a);
      indices[i] = idx;

      // 自适应抖动：边缘/噪点及全透明区域不扩散误差，避免加噪和光晕颗粒
      const orr = rgba[o];
      const org = rgba[o + 1];
      const orb = rgba[o + 2];
      const lr = x > 0 ? rgba[o - 4] : orr;
      const lg = x > 0 ? rgba[o - 3] : org;
      const lb = x > 0 ? rgba[o - 2] : orb;
      const ur = y > 0 ? rgba[o - width * 4] : orr;
      const ug = y > 0 ? rgba[o - width * 4 + 1] : org;
      const ub = y > 0 ? rgba[o - width * 4 + 2] : orb;
      const localRange = Math.max(
        Math.max(orr, lr, ur) - Math.min(orr, lr, ur),
        Math.max(org, lg, ug) - Math.min(org, lg, ug),
        Math.max(orb, lb, ub) - Math.min(orb, lb, ub),
      );
      if (localRange > EDGE_THRESHOLD || a0 < 8) continue;

      const er = (qx - coords[idx * 4]) * dither;
      const eg = (qy - coords[idx * 4 + 1]) * dither;
      const eb = (qz - coords[idx * 4 + 2]) * dither;
      const ea = (a - coords[idx * 4 + 3]) * dither;


      if (x + 1 < width) {
        const n = i + 1;
        if (rgba[n * 4 + 3] >= 8) {
          errR[cur * width + x + 1] += (er * 7) / 16;
          errG[cur * width + x + 1] += (eg * 7) / 16;
          errB[cur * width + x + 1] += (eb * 7) / 16;
          errA[cur * width + x + 1] += (ea * 7) / 16;
        }
      }
      if (y + 1 < height) {
        if (x > 0) {
          const n = i + width - 1;
          if (rgba[n * 4 + 3] >= 8) {
            errR[next * width + x - 1] += (er * 3) / 16;
            errG[next * width + x - 1] += (eg * 3) / 16;
            errB[next * width + x - 1] += (eb * 3) / 16;
            errA[next * width + x - 1] += (ea * 3) / 16;
          }
        }
        {
          const n = i + width;
          if (rgba[n * 4 + 3] >= 8) {
            errR[next * width + x] += (er * 5) / 16;
            errG[next * width + x] += (eg * 5) / 16;
            errB[next * width + x] += (eb * 5) / 16;
            errA[next * width + x] += (ea * 5) / 16;
          }
        }
        if (x + 1 < width) {
          const n = i + width + 1;
          if (rgba[n * 4 + 3] >= 8) {
            errR[next * width + x + 1] += er / 16;
            errG[next * width + x + 1] += eg / 16;
            errB[next * width + x + 1] += eb / 16;
            errA[next * width + x + 1] += ea / 16;
          }
        }
      }
    }
    if ((y + 1) % chunkRows === 0 || y === height - 1) {
      onProgress?.(Math.min(1, (y + 1) / height));
      if (y < height - 1) await yieldToUI();
    }
  }
  return indices;
}

// ---------- 索引色 PNG 编码 ----------

async function encodeIndexedPng(
  width: number,
  height: number,
  palette: Rgba[],
  indices: Uint8Array,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  const paletteCount = palette.length;
  const plte = new Uint8Array(paletteCount * 3);
  const trns = new Uint8Array(paletteCount);
  for (let i = 0; i < paletteCount; i++) {
    plte[i * 3] = palette[i][0];
    plte[i * 3 + 1] = palette[i][1];
    plte[i * 3 + 2] = palette[i][2];
    trns[i] = palette[i][3];
  }

  const ihdr = new Uint8Array(13);
  setU32(ihdr, 0, width);
  setU32(ihdr, 4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // color type: indexed

  // 过滤：每行在 None/Sub/Up/Avg/Paeth 中选启发式代价最小的，提升压缩率
  const stride = 1 + width;
  const raw = new Uint8Array(stride * height);
  const candidates = Array.from({ length: 5 }, () => new Uint8Array(width));
  const chunkRows = 128;
  for (let y = 0; y < height; y += chunkRows) {
    const endY = Math.min(height, y + chunkRows);
    for (let yy = y; yy < endY; yy++) {
      const row = yy * stride;
      const filter = bestFilterRow(indices, yy, width, candidates);
      raw[row] = filter;
      raw.set(candidates[filter], row + 1);
    }
    onProgress?.(Math.min(0.9, (y + chunkRows) / height));
    if (endY < height) await yieldToUI();
  }

  await yieldToUI(); // 让进度条先渲染到 90%，再执行同步压缩
  const idatData = await deflateZlib(raw);
  onProgress?.(1);

  const chunks: Uint8Array[] = [];
  chunks.push(PNG_SIGNATURE);
  chunks.push(pngChunk('IHDR', ihdr));
  chunks.push(pngChunk('PLTE', plte));
  chunks.push(pngChunk('tRNS', trns));
  chunks.push(pngChunk('IDAT', idatData));
  chunks.push(pngChunk('IEND', new Uint8Array(0)));

  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return new Blob([out], { type: 'image/png' });
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) typeBytes[i] = type.charCodeAt(i);
  const body = new Uint8Array(4 + data.length);
  body.set(typeBytes, 0);
  body.set(data, 4);
  const crc = crc32(body);

  const out = new Uint8Array(8 + data.length + 4);
  setU32(out, 0, data.length);
  out.set(body, 4);
  setU32(out, 4 + body.length, crc);
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function setU32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

/** 计算某一行 5 种 PNG filter 的候选字节与启发式代价，返回代价最小的 filter 类型。 */
function bestFilterRow(
  indices: Uint8Array,
  y: number,
  width: number,
  candidates: Uint8Array[],
): number {
  const rowStart = y * width;
  const prevStart = rowStart - width;
  const costs = [0, 0, 0, 0, 0];

  for (let x = 0; x < width; x++) {
    const cur = indices[rowStart + x];
    const left = x > 0 ? indices[rowStart + x - 1] : 0;
    const up = y > 0 ? indices[prevStart + x] : 0;
    const upleft = y > 0 && x > 0 ? indices[prevStart + x - 1] : 0;

    candidates[0][x] = cur;
    candidates[1][x] = (cur - left) & 0xff;
    candidates[2][x] = (cur - up) & 0xff;
    candidates[3][x] = (cur - ((left + up) >> 1)) & 0xff;
    candidates[4][x] = (cur - paethPredictor(left, up, upleft)) & 0xff;

    for (let f = 0; f < 5; f++) {
      const v = candidates[f][x];
      costs[f] += v < 128 ? v : 256 - v;
    }
  }

  let best = 0;
  for (let f = 1; f < 5; f++) {
    if (costs[f] < costs[best]) best = f;
  }
  return best;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** 让出主线程，使 UI 能在分片处理间隙渲染进度。 */
function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
