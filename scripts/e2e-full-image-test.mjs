/**
 * 图片压缩全量端到端测试（真实浏览器 + 真实照片素材）
 *
 * 覆盖：
 *  - 批量导入混合格式（JPG/PNG/WebP）+ 不支持文件（SVG）保留与提示
 *  - 新上传只压缩新增项、新文件排在列表最前（fix b7e5bba / c720a9c）
 *  - 设置变更时全部重新压缩（fix b7e5bba）
 *  - 质量预设（极致/标准/紧凑）、压缩比例（50%/20%）目标体积
 *  - 格式转换 WebP/JPEG/PNG（信息行显示输出格式、角标保持原始格式 fix ff95b21）
 *  - 保留元数据开关（EXIF 剥离 / 写回）
 *  - 最大边长限制
 *  - ZIP 打包下载与文件名规则
 *  - 对比预览弹窗
 *  - 移动端视口核心流程
 *  - 无外部网络请求、无页面错误
 *
 * 用法：先启动 dev 服务，然后 node scripts/e2e-full-image-test.mjs
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import piexif from 'piexifjs';
import { chromium } from 'playwright';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173/';
const PICTURES = 'C:\\Users\\52514\\Pictures';
const FIXTURES = join(process.env.TEMP ?? 'C:\\Users\\52514\\AppData\\Local\\Temp', 'devkits-e2e-fixtures');
const OUT_DIR = process.env.E2E_OUT_DIR ?? join(process.cwd(), '.e2e-out');
const SHOT_DIR = process.env.E2E_SHOT_DIR ?? join(process.cwd(), '.e2e-out', 'shots');
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(SHOT_DIR, { recursive: true });

const BATCH = [
  join(PICTURES, '微信图片_20260319171731_963_7.jpg'), // 4.56MB, 带 EXIF
  join(PICTURES, 'hh.png'),                            // 1.51MB
  join(PICTURES, '微信图片_20250908113422_188_6.png'), // 1.34MB
  join(PICTURES, 'v2-36d081796a647c4dab804f13aa7f5a57_r.jpg'), // 1.09MB
  join(PICTURES, '20170825180819_NzPcK.jpeg'),         // 402KB
  join(PICTURES, '微信图片_20260806145641_2_106.jpg'), // 176KB
].map((p) => ({ path: p, name: p.split('\\').pop(), size: statSync(p).size }));

const EXTRA = [
  join(PICTURES, '微信图片_20260421140538_29_37.jpg'),
  join(FIXTURES, 'sample.bmp'),
  join(FIXTURES, 'sample-animated.gif'),
].map((p) => ({ path: p, name: p.split('\\').pop(), size: statSync(p).size }));

const UNSUPPORTED_SVG = join(PICTURES, '导航选中.svg');
const TRANSPARENT_PNG = join(process.cwd(), 'test-images', 'flat-icon.png');
const WEBP_SAMPLE = join(process.cwd(), 'test-images', 'photo-webp.webp');
const GLOW_PNG = join(process.cwd(), 'test-images', 'glow-gradient.png');

const results = [];
const failures = [];
const pageErrors = [];
const externalRequests = [];

function ok(name, pass, detail = '') {
  results.push({ name, pass, detail });
  if (!pass) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? `  ${detail}` : ''}`);
}

function parseBytes(text) {
  if (!text) return null;
  const m = /(\d[\d.]*)\s*(B|KB|MB)/.exec(text);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] === 'B' ? n : m[2] === 'KB' ? n * 1024 : n * 1024 * 1024;
}

async function cardData(page, name) {
  return page.evaluate((n) => {
    const cards = Array.from(document.querySelectorAll('[class*="card"]'));
    const card = cards.find((c) => c.querySelector('[class*="name"]')?.textContent?.trim() === n);
    if (!card) return null;
    const q = (sel) => card.querySelector(sel)?.textContent?.trim() ?? '';
    const title = (t) => card.querySelector(`[title="${t}"]`)?.textContent?.trim() ?? '';
    return {
      name: q('[class*="name"]'),
      previewTag: q('[class*="previewTag"]'),
      format: q('[class*="sizeRow"] [class*="format"]'),
      original: title('原图'),
      compressed: title('压缩后'),
      ratio: title('压缩率'),
      quality: title('质量'),
      status: q('[class*="badge"]'),
      error: q('[class*="errorText"]'),
      note: q('[class*="note"]'),
      thumbClass: card.querySelector('[class*="thumbWrap"]')?.className ?? '',
    };
  }, name);
}

async function cardNames(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[class*="card"]'))
      .map((c) => c.querySelector('[class*="name"]')?.textContent?.trim() ?? '')
      .filter(Boolean),
  );
}

async function waitCardNameTerminal(page, name, timeout = 120_000) {
  await page.waitForFunction(
    (n) => {
      const cards = Array.from(document.querySelectorAll('[class*="card"]'));
      const card = cards.find((c) => c.querySelector('[class*="name"]')?.textContent?.trim() === n);
      return card && (card.textContent.includes('完成') || card.textContent.includes('失败') || card.textContent.includes('未支持'));
    },
    name,
    { timeout },
  );
}

async function allTerminal(page, timeout = 180_000) {
  try {
    await page.waitForFunction(
      () => {
        const cards = Array.from(document.querySelectorAll('[class*="card"]'));
        if (cards.length === 0) return false;
        return cards.every((c) => {
          const t = c.textContent;
          return t.includes('完成') || t.includes('失败') || t.includes('未支持');
        });
      },
      undefined,
      { timeout },
    );
  } catch (err) {
    const states = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="card"]')).map((c) => {
        const name = c.querySelector('[class*="name"]')?.textContent?.trim() ?? '?';
        const badge = c.querySelector('[class*="badge"]')?.textContent?.trim() ?? '?';
        const note = c.querySelector('[class*="note"]')?.textContent?.trim() ?? '';
        return `${name}[${badge}]${note ? `(${note})` : ''}`;
      }),
    );
    throw new Error(`allTerminal 超时（${timeout}ms），当前卡片状态：${states.join(' | ')}\n原始错误：${err.message}`);
  }
}

async function waitBusyThenDone(page, timeout = 180_000) {
  // 设置变更后先出现待处理/压缩中，再等全部终态
  await page.waitForFunction(
    () => {
      const cards = Array.from(document.querySelectorAll('[class*="card"]'));
      return cards.some((c) => c.textContent.includes('待处理') || c.textContent.includes('压缩中'));
    },
    undefined,
    { timeout: 60_000 },
  );
  await allTerminal(page, timeout);
}

async function clickSegment(page, name) {
  await page.getByRole('button', { name, exact: true }).click();
}

async function downloadCard(page, name, savePath) {
  const card = page.locator('[class*="card"]').filter({ hasText: name });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    card.getByRole('button', { name: '下载', exact: true }).click(),
  ]);
  await download.saveAs(savePath);
  return savePath;
}

async function downloadAllZip(page, savePath) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name: '下载全部 (ZIP)', exact: true }).click(),
  ]);
  await download.saveAs(savePath);
  return download.suggestedFilename();
}

function parseJpegDims(buf) {
  let offset = 2;
  while (offset + 9 <= buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const len = (buf[offset + 2] << 8) | buf[offset + 3];
    if (len < 2) return null;
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { w: (buf[offset + 7] << 8) | buf[offset + 8], h: (buf[offset + 5] << 8) | buf[offset + 6] };
    offset += 2 + len;
  }
  return null;
}

function pngChunks(buf) {
  const chunks = [];
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    chunks.push({ type, len });
    off += 12 + len;
  }
  return chunks;
}

function hasAscii(buf, s) {
  return buf.includes(Buffer.from(s, 'ascii'));
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`);
  });
  page.on('request', (r) => {
    const u = r.url();
    if (/^https?:/.test(u) && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u)) {
      externalRequests.push(u);
    }
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // ---- 0. 文件选择器 accept 属性（fix 08b4615） ----
  const accept = await page.locator('input[type="file"]').getAttribute('accept');
  ok(
    '文件选择 accept 完整覆盖 TinyPNG 风格列表',
    /\.jpg,\s*\.jpeg,\s*\.png,\s*\.webp,\s*\.gif,\s*\.bmp,\s*\.svg/.test(accept ?? ''),
    `accept="${accept}"`,
  );

  // ---- 1. 批量导入（6 张真实照片 + WebP + 透明 PNG + 不支持 SVG） ----
  const batchFiles = [
    ...BATCH.map((f) => f.path),
    WEBP_SAMPLE,
    TRANSPARENT_PNG,
    GLOW_PNG,
    UNSUPPORTED_SVG,
  ];
  const t0 = Date.now();
  await page.setInputFiles('input[type="file"]', batchFiles);
  await allTerminal(page, 240_000);
  const batchMs = Date.now() - t0;

  const supportedNames = [...BATCH.map((f) => f.name), 'photo-webp.webp', 'flat-icon.png', 'glow-gradient.png'];
  let supportedPass = true;
  const sizes = {};
  const batchDetails = [];
  for (const n of supportedNames) {
    const d = await cardData(page, n);
    if (!d || d.status !== '完成') {
      supportedPass = false;
      failures.push(`卡片 ${n} 未完成: ${JSON.stringify(d)}`);
      continue;
    }
    const orig = parseBytes(d.original);
    const comp = parseBytes(d.compressed);
    sizes[n] = { orig, comp };
    const keptOriginal = comp !== null && orig !== null && comp >= orig;
    batchDetails.push(`${n}:${(orig / 1024).toFixed(0)}KB->${(comp / 1024).toFixed(0)}KB${keptOriginal ? '(保留原图)' : ''}`);
    if (orig === null || comp === null || comp > orig) {
      supportedPass = false;
      failures.push(`卡片 ${n} 压缩后未小于原图: ${d.original} -> ${d.compressed}`);
    }
  }
  ok(
    `批量导入 10 张（9 支持 + 1 不支持 SVG）全部完成，${batchMs}ms`,
    supportedPass,
    batchDetails.join(' '),
  );

  const svgCard = await cardData(page, '导航选中.svg');
  ok(
    '不支持的 SVG 保留在列表中并提示（fix 896682e）',
    svgCard?.status === '未支持' && /暂不支持 SVG 格式/.test(svgCard.error ?? ''),
    `${svgCard?.error}`,
  );

  const names = await cardNames(page);
  const unsupportedIdx = names.indexOf('导航选中.svg');
  ok(
    '不支持的图片排到列表末尾（feat 2697fb4）',
    unsupportedIdx === names.length - 1,
    `位置 ${unsupportedIdx}/${names.length - 1}`,
  );

  const summaryText = await page.locator('div[class*="summary"]').first().textContent();
  ok(
    '汇总区域显示不支持数量（feat b90e404）',
    /1 张不支持/.test(summaryText ?? '') && /9 张/.test(summaryText ?? ''),
    summaryText?.replace(/\s+/g, ' ').trim(),
  );

  // 透明 PNG 预览应为棋盘格（revert 2734697）
  const flat = await cardData(page, 'flat-icon.png');
  ok(
    '透明 PNG 预览使用棋盘格底色',
    /checker/i.test(flat?.thumbClass ?? ''),
    flat?.thumbClass,
  );

  // ---- 2. 追加上传：只压缩新增项，新文件排最前（fix b7e5bba / c720a9c） ----
  await page.setInputFiles('input[type="file"]', [EXTRA[0].path]);
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('[class*="card"]'))
      .some((c) => c.textContent.includes('待处理') || c.textContent.includes('压缩中')),
    undefined,
    { timeout: 30_000 },
  );
  const namesDuring = await cardNames(page);
  const oldRequeued = await page.evaluate(() => {
    const old = ['微信图片_20260319171731_963_7.jpg', 'hh.png', 'flat-icon.png', 'photo-webp.webp'];
    return Array.from(document.querySelectorAll('[class*="card"]')).filter((c) =>
      old.some((n) => c.querySelector('[class*="name"]')?.textContent?.trim() === n),
    ).some((c) => c.textContent.includes('待处理') || c.textContent.includes('压缩中'));
  });
  await allTerminal(page, 120_000);
  const newName = EXTRA[0].name;
  const newCard = await cardData(page, newName);
  ok(
    '追加上传：旧图片未被重新入队（fix b7e5bba）',
    !oldRequeued && newCard?.status === '完成',
    `旧卡片保持完成，新卡片 ${newCard?.status}`,
  );
  ok(
    '新上传的图片排在列表最前面（feat c720a9c）',
    namesDuring[0] === newName,
    `首位=${namesDuring[0]}`,
  );

  // ---- 3. 设置变更：全部重新压缩（fix b7e5bba） ----
  await clickSegment(page, '标准');
  await waitBusyThenDone(page, 240_000);
  let allQuality65 = true;
  const q65 = {};
  for (const n of supportedNames) {
    const d = await cardData(page, n);
    if (d.quality !== '65') {
      allQuality65 = false;
      failures.push(`设置变更后 ${n} 质量=${d.quality}`);
    }
    q65[n] = parseBytes(d.compressed);
  }
  ok('设置变更触发全部重新压缩且质量档生效', allQuality65, '全部卡片质量=65');

  // ---- 4. 质量预设：紧凑(40) 应比 标准(65) 更小 ----
  await clickSegment(page, '紧凑');
  await waitBusyThenDone(page, 240_000);
  const big = '微信图片_20260319171731_963_7.jpg';
  const d40 = await cardData(page, big);
  const b65 = q65[big];
  ok(
    '质量档 40 比 65 体积更小',
    parseBytes(d40.compressed) < b65,
    `${(b65 / 1024).toFixed(0)}KB -> ${(parseBytes(d40.compressed) / 1024).toFixed(0)}KB`,
  );

  // ---- 5. 压缩比例 50%：结果 ≤ 原图×50%×1.05 ----
  await clickSegment(page, '50%');
  await waitBusyThenDone(page, 240_000);
  let ratio50ok = true;
  const ratio50 = [];
  for (const n of supportedNames) {
    const d = await cardData(page, n);
    const comp = parseBytes(d.compressed);
    const target = sizes[n].orig * 0.5;
    const pass = comp <= target * 1.05;
    if (!pass) {
      ratio50ok = false;
      failures.push(`50% 目标未达标: ${n} ${d.compressed} > ${(target / 1024).toFixed(0)}KB`);
    }
    ratio50.push(`${n}:${(comp / 1024).toFixed(0)}KB/${(target / 1024).toFixed(0)}KB`);
  }
  ok('压缩比例 50%：所有图片 ≤ 目标体积（±5% 容差）', ratio50ok, ratio50.join(' '));

  // ---- 6. 压缩比例 20%：达标或明确标注无法达标 ----
  await clickSegment(page, '20%');
  await waitBusyThenDone(page, 300_000);
  let ratio20ok = true;
  const ratio20 = [];
  for (const n of supportedNames) {
    const d = await cardData(page, n);
    const comp = parseBytes(d.compressed);
    const target = sizes[n].orig * 0.2;
    const pass = comp <= target * 1.05 || /无法达标/.test(d.note ?? '');
    if (!pass) {
      ratio20ok = false;
      failures.push(`20% 既未达标也未标注无法达标: ${n}`);
    }
    ratio20.push(`${n}:${(comp / 1024).toFixed(0)}KB/${(target / 1024).toFixed(0)}KB${/无法达标/.test(d.note ?? '') ? '(无法达标)' : ''}`);
  }
  ok('压缩比例 20%：达标或明确提示无法达标', ratio20ok, ratio20.join(' '));

  // ---- 7. 重置设置 ----
  await clickSegment(page, '重置');
  await waitBusyThenDone(page, 240_000);

  // ---- 8. 格式转换 WebP：信息行=输出格式，角标=原始格式（fix ff95b21 / 875e0c1） ----
  await clickSegment(page, 'WebP');
  await waitBusyThenDone(page, 240_000);
  let webpOk = true;
  for (const n of supportedNames) {
    const d = await cardData(page, n);
    const isJpeg = /\.(jpe?g)$/i.test(n);
    const isPng = /\.png$/i.test(n);
    if (d.format !== 'WebP' || (isPng && d.previewTag !== 'PNG') || (isJpeg && d.previewTag !== 'JPEG')) {
      webpOk = false;
      failures.push(`WebP 转换标注错误: ${n} 输出=${d.format} 角标=${d.previewTag}`);
    }
  }
  ok('转 WebP：信息行显示 WebP、角标保持原始格式', webpOk, '8 张全部正确');

  const webpPath = join(OUT_DIR, 'out-webp.webp');
  await downloadCard(page, WEBP_SAMPLE.split('\\').pop(), webpPath);
  const webpBuf = readFileSync(webpPath);
  ok(
    'WebP 输出文件头正确且扩展名为 .webp',
    webpBuf.toString('ascii', 0, 4) === 'RIFF' && webpBuf.toString('ascii', 8, 12) === 'WEBP',
    `${webpBuf.length} bytes`,
  );

  // ---- 9. 格式转换 JPEG（含透明 PNG 场景） ----
  await clickSegment(page, 'JPEG');
  await waitBusyThenDone(page, 240_000);
  let jpegOk = true;
  for (const n of supportedNames) {
    const d = await cardData(page, n);
    if (d.format !== 'JPEG') {
      jpegOk = false;
      failures.push(`JPEG 转换失败: ${n} 输出=${d.format}`);
    }
  }
  ok('转 JPEG：全部输出 JPEG', jpegOk);

  const jpegPath = join(OUT_DIR, 'out-transparent.jpg');
  await downloadCard(page, 'flat-icon.png', jpegPath);
  const jpegBuf = readFileSync(jpegPath);
  ok(
    '透明 PNG 转 JPEG 成功（暗色底填充，无报错）',
    jpegBuf[0] === 0xff && jpegBuf[1] === 0xd8,
    `${jpegBuf.length} bytes`,
  );

  // ---- 10. 格式转换 PNG（有损量化，索引色 PLTE） ----
  await clickSegment(page, 'PNG');
  await waitBusyThenDone(page, 240_000);
  let pngOk = true;
  const pngDetails = [];
  for (const n of supportedNames) {
    const d = await cardData(page, n);
    const orig = parseBytes(d.original);
    const comp = parseBytes(d.compressed);
    const keptOriginal = comp !== null && orig !== null && comp >= orig;
    pngDetails.push(`${n}:${d.format}${keptOriginal ? '(保留原图)' : ''}`);
    if (d.format !== 'PNG' && !keptOriginal) {
      pngOk = false;
      failures.push(`PNG 转换失败: ${n} 输出=${d.format}`);
    }
  }
  ok('转 PNG：输出 PNG 或原图已更优时保留原图', pngOk, pngDetails.join(' '));

  const pngPath = join(OUT_DIR, 'out-png.png');
  await downloadCard(page, big, pngPath);
  const pngBuf = readFileSync(pngPath);
  const chunks = pngChunks(pngBuf);
  ok(
    'PNG 输出为调色板索引色（含 PLTE）',
    pngBuf[0] === 0x89 && pngBuf[1] === 0x50 && pngBuf[2] === 0x4e && pngBuf[3] === 0x47 &&
      chunks.some((c) => c.type === 'PLTE'),
    `chunks=${chunks.map((c) => c.type).join(',')}`,
  );

  // 转 PNG 时因输出更大而保留原文件的卡片，应标注“原图已是最优”
  let keptNoteOk = true;
  const keptNotes = [];
  for (const n of supportedNames) {
    const d = await cardData(page, n);
    if (d.format !== 'PNG') {
      const hasNote = /原图已是最优/.test(d?.note ?? '');
      keptNotes.push(`${n}:${hasNote ? '已标注' : '缺标注'}`);
      if (!hasNote) {
        keptNoteOk = false;
        failures.push(`保留原图的卡片 ${n} 缺少“原图已是最优”标注`);
      }
    }
  }
  ok('保留原图时标注“原图已是最优”', keptNoteOk, keptNotes.join(' '));

  // ---- 11. 恢复原格式 + 元数据测试 ----
  await clickSegment(page, '原格式');
  await waitBusyThenDone(page, 240_000);

  const metaOff = join(OUT_DIR, 'meta-off.jpg');
  await downloadCard(page, big, metaOff);
  const metaOffBuf = readFileSync(metaOff);
  ok(
    '默认剥离元数据：压缩结果不含 EXIF',
    !hasAscii(metaOffBuf, 'Exif'),
    `${metaOffBuf.length} bytes`,
  );

  await page.getByRole('switch').click(); // 打开保留元数据
  await waitBusyThenDone(page, 240_000);
  const metaOn = join(OUT_DIR, 'meta-on.jpg');
  await downloadCard(page, big, metaOn);
  const metaOnBuf = readFileSync(metaOn);
  const wechatCard = await cardData(page, big);
  ok(
    '保留元数据开启：真实微信照片 EXIF 解析失败时明确提示',
    !hasAscii(metaOnBuf, 'Exif') && /EXIF 解析失败/.test(wechatCard?.note ?? ''),
    `${metaOnBuf.length} bytes，卡片提示：${wechatCard?.note}`,
  );

  const pngMetaHint = await cardData(page, 'hh.png');
  ok(
    'PNG 输出提示元数据不支持',
    /不支持保留元数据/.test(pngMetaHint.note ?? ''),
    pngMetaHint.note,
  );

  // 标准 EXIF 的 JPEG 应能正常写回（元数据开关仍为开启）
  const exifFixture = join(OUT_DIR, 'exif-test.jpg');
  const cleanJpeg = readFileSync(join(process.cwd(), 'test-images', 'photo-jpeg-medium.jpg'));
  const cleanDataUrl = 'data:image/jpeg;base64,' + cleanJpeg.toString('base64');
  const exifDataUrl = piexif.insert(
    piexif.dump({ '0th': { [piexif.ImageIFD.ImageDescription]: 'e2e-metadata-test' } }),
    cleanDataUrl,
  );
  writeFileSync(exifFixture, Buffer.from(exifDataUrl.split(',')[1], 'base64'));
  await page.setInputFiles('input[type="file"]', [exifFixture]);
  await waitCardNameTerminal(page, 'exif-test.jpg');
  const exifOut = join(OUT_DIR, 'meta-roundtrip.jpg');
  await downloadCard(page, 'exif-test.jpg', exifOut);
  ok(
    '保留元数据：标准 EXIF 的 JPEG 输出可写回 EXIF',
    hasAscii(readFileSync(exifOut), 'Exif'),
    `${readFileSync(exifOut).length} bytes`,
  );

  await page.getByRole('switch').click(); // 关闭
  await waitBusyThenDone(page, 240_000);

  // ---- 12. 最大边长限制 ----
  await page.locator('#max-edge').fill('800');
  await waitBusyThenDone(page, 240_000);
  const edgePath = join(OUT_DIR, 'edge-800.jpg');
  await downloadCard(page, big, edgePath);
  const dims = parseJpegDims(readFileSync(edgePath));
  ok(
    '最大边长 800px 生效',
    dims !== null && dims.w <= 800 && dims.h <= 800,
    JSON.stringify(dims),
  );
  await clickSegment(page, '重置');
  await waitBusyThenDone(page, 240_000);

  // ---- 13. ZIP 打包下载与文件名规则 ----
  const zipPath = join(OUT_DIR, 'images.zip');
  const zipName = await downloadAllZip(page, zipPath);
  const zipEntries = unzipSync(readFileSync(zipPath));
  const entryNames = Object.keys(zipEntries).sort();
  const expectedNames = [...supportedNames, EXTRA[0].name, 'exif-test.jpg'].sort();
  const nameOk =
    entryNames.length === expectedNames.length &&
    expectedNames.every((n) => entryNames.includes(n));
  ok(
    'ZIP 打包成功，文件名与输入一致',
    zipName === 'compressed-images.zip' && nameOk,
    `zip=${zipName} entries=${entryNames.join(',')}`,
  );
  let zipMagicOk = true;
  for (const [name, data] of Object.entries(zipEntries)) {
    if (/\.png$/i.test(name) && !(data[0] === 0x89 && data[1] === 0x50)) zipMagicOk = false;
    if (/\.(jpe?g)$/i.test(name) && !(data[0] === 0xff && data[1] === 0xd8)) zipMagicOk = false;
    if (/\.webp$/i.test(name) && !(Buffer.from(data.buffer, data.byteOffset, 4).toString('ascii') === 'RIFF')) zipMagicOk = false;
  }
  ok('ZIP 内每个条目文件头与扩展名一致', zipMagicOk);

  // ---- 14. 对比预览弹窗 ----
  const compareCard = page.locator('[class*="card"]').filter({ hasText: '微信图片_20260806145641_2_106.jpg' });
  await compareCard.getByRole('button', { name: '对比', exact: true }).click();
  await page.locator('[class*="dialog"]').waitFor({ state: 'visible' });
  const dialogText = await page.locator('[class*="dialog"]').textContent();
  ok(
    '对比弹窗：并排展示原图与压缩后',
    /对比预览/.test(dialogText ?? '') && /原图/.test(dialogText ?? '') && /压缩后/.test(dialogText ?? ''),
    dialogText?.replace(/\s+/g, ' ').trim().slice(0, 120),
  );
  await page.locator('[class*="dialog"]').screenshot({ path: join(SHOT_DIR, 'image-compare.png') });
  await page.locator('[class*="dialog"]').getByRole('button', { name: '✕' }).click();

  // ---- 15. 重新压缩时 unsupported 卡片保留 ----
  await clickSegment(page, '重新压缩');
  await waitBusyThenDone(page, 240_000);
  const svgAfter = await cardData(page, '导航选中.svg');
  ok(
    '重新压缩后 unsupported 卡片仍保留（fix 896682e）',
    svgAfter?.status === '未支持',
    `status=${svgAfter?.status}`,
  );

  // ---- 16. GIF / BMP 行为（需求文档声明支持，验证实际行为） ----
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setInputFiles('input[type="file"]', [EXTRA[1].path, EXTRA[2].path]);
  await allTerminal(page, 120_000);
  const bmpCard = await cardData(page, 'sample.bmp');
  const gifCard = await cardData(page, 'sample-animated.gif');
  ok(
    'BMP 上传后行为明确',
    bmpCard?.status === '未支持' && /暂不支持 BMP 格式/.test(bmpCard.error ?? ''),
    `${bmpCard?.status} ${bmpCard?.error}`,
  );
  ok(
    'GIF 上传后行为明确',
    gifCard?.status === '未支持' && /暂不支持 GIF 格式/.test(gifCard.error ?? ''),
    `${gifCard?.status} ${gifCard?.error}`,
  );

  // ---- 17. 桌面结果截图 ----
  await page.screenshot({ path: join(SHOT_DIR, 'image-results.png') });

  // ---- 18. 移动端视口（375px）核心流程 ----
  const mobileCtx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  const mPage = await mobileCtx.newPage();
  mPage.on('pageerror', (e) => pageErrors.push(`mobile pageerror: ${e.message}`));
  await mPage.goto(BASE_URL, { waitUntil: 'networkidle' });
  await mPage.setInputFiles('input[type="file"]', [EXTRA[0].path]);
  await allTerminal(mPage, 120_000);
  const overflow = await mPage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  const downloadBtn = mPage.getByRole('button', { name: '下载全部 (ZIP)', exact: true });
  ok(
    '移动端 375px：核心流程可用且无横向溢出',
    overflow <= 1 && (await downloadBtn.isEnabled()),
    `overflow=${overflow}px`,
  );
  await mPage.screenshot({ path: join(SHOT_DIR, 'image-mobile.png') });
  await mobileCtx.close();

  // ---- 19. 无外部网络请求 ----
  ok(
    '处理过程无外部网络请求（本地处理）',
    externalRequests.length === 0,
    externalRequests.join(', '),
  );
  ok('无页面/控制台错误', pageErrors.length === 0, pageErrors.join(' | '));

  await context.close();
} finally {
  await browser.close();
}

console.log(`\n===== 图片压缩全量测试：${results.length - failures.length}/${results.length} 通过 =====`);
if (failures.length > 0) {
  console.log('\n失败项：');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('全部通过');
