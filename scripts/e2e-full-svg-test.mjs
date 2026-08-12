/**
 * SVG 压缩全量端到端测试（真实浏览器 + 真实 SVG 素材）
 *
 * 覆盖：
 *  - 批量导入 .svg / .svgz（含 2MB 真实大文件）
 *  - 三档压缩强度（高保真 / 平衡 / 极限），极限 ≤ 平衡
 *  - SVGZ 输出格式与预览
 *  - 对比弹窗：视觉对比 + 优化后源码 + 复制
 *  - ZIP 打包（svg/svgz 条目、文件名规则）
 *  - 保留原文件策略（already-optimal）
 *  - 无效 SVG / 超大文件 / 非 SVG 文件处理
 *  - 移动端视口
 *  - 无外部网络请求、无页面错误
 */
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { chromium } from 'playwright';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173/#/svg';
const PICTURES = 'C:\\Users\\52514\\Pictures';
const FIXTURES = join(process.env.TEMP ?? 'C:\\Users\\52514\\AppData\\Local\\Temp', 'devkits-e2e-fixtures');
const OUT_DIR = process.env.E2E_OUT_DIR ?? join(process.cwd(), '.e2e-out');
const SHOT_DIR = process.env.E2E_SHOT_DIR ?? join(process.cwd(), '.e2e-out', 'shots');
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(SHOT_DIR, { recursive: true });

const TI = join(process.cwd(), 'test-images');
const BATCH = [
  join(PICTURES, '导航选中.svg'),       // 2.08MB 真实大文件
  join(PICTURES, '底框.svg'),           // 80KB
  join(PICTURES, '安全运行时长.svg'),   // 42KB
  join(PICTURES, '门禁默认.svg'),       // 14KB
  join(TI, 'icon-bloated.svgz'),        // svgz 输入
  join(TI, 'icon-set-duplicates.svg'),  // 重复路径（极限档用例）
  join(TI, 'icon-bloated.svg'),
  join(TI, 'pre-optimized.svg'),
  join(TI, 'tiny-minimal.svg'),
  join(TI, 'already-optimal.svg'),      // 保留原文件用例
].map((p) => ({ path: p, name: p.split('\\').pop(), size: statSync(p).size }));

const results = [];
const failures = [];
const pageErrors = [];
const externalRequests = [];

function ok(name, pass, detail = '') {
  results.push({ name, pass, detail });
  if (!pass) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? `  ${detail}` : ''}`);
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
      original: title('原文件'),
      compressed: title('压缩后'),
      ratio: title('压缩率'),
      status: q('[class*="badge"]'),
      error: q('[class*="errorText"]'),
      note: q('[class*="note"]'),
    };
  }, name);
}

async function allTerminal(page, timeout = 180_000) {
  await page.waitForFunction(
    () => {
      const cards = Array.from(document.querySelectorAll('[class*="card"]'));
      if (cards.length === 0) return false;
      return cards.every((c) => {
        const t = c.textContent;
        return t.includes('完成') || t.includes('失败');
      });
    },
    undefined,
    { timeout },
  );
}

async function waitBusyThenDone(page, timeout = 180_000) {
  await page.waitForFunction(
    () => {
      const cards = Array.from(document.querySelectorAll('[class*="card"]'));
      return cards.some((c) => c.textContent.includes('待处理') || c.textContent.includes('压缩中'));
    },
    undefined,
    { timeout: 30_000 },
  );
  await allTerminal(page, timeout);
}

async function clickSegment(page, name) {
  await page.getByRole('button', { name, exact: true }).click();
}

async function downloadAllZip(page, savePath) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name: '下载全部 (ZIP)', exact: true }).click(),
  ]);
  await download.saveAs(savePath);
  return download.suggestedFilename();
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
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

  // ---- 1. 批量导入 10 个真实 SVG（含 svgz、2MB 大文件） ----
  const t0 = Date.now();
  await page.setInputFiles('input[type="file"]', BATCH.map((f) => f.path));
  await allTerminal(page, 300_000);
  const batchMs = Date.now() - t0;

  let batchOk = true;
  const balancedSizes = {};
  for (const f of BATCH) {
    const d = await cardData(page, f.name);
    if (!d || d.status !== '完成') {
      batchOk = false;
      failures.push(`SVG 卡片 ${f.name} 未完成: ${JSON.stringify(d)}`);
      continue;
    }
    const orig = parseBytes(d.original);
    const comp = parseBytes(d.compressed);
    balancedSizes[f.name] = comp;
    if (orig === null || comp === null || comp > orig) {
      batchOk = false;
      failures.push(`SVG ${f.name} 优化结果大于原文件: ${d.original} -> ${d.compressed}`);
    }
  }
  ok(
    `批量导入 10 个 SVG（含 2MB 大文件）全部完成，${batchMs}ms`,
    batchOk,
    '10/10 完成且结果 ≤ 原文件',
  );

  const svgzCard = await cardData(page, 'icon-bloated.svgz');
  ok(
    'svgz 输入自动解压并处理',
    svgzCard?.status === '完成',
    `${svgzCard?.original} -> ${svgzCard?.compressed}${svgzCard?.note ? `（${svgzCard.note}）` : ''}`,
  );

  // ---- 2. 三档压缩强度 ----
  await clickSegment(page, '高保真');
  await waitBusyThenDone(page, 300_000);
  const highSizes = {};
  for (const f of BATCH) {
    const d = await cardData(page, f.name);
    highSizes[f.name] = parseBytes(d.compressed);
  }
  const dup = 'icon-set-duplicates.svg';
  const dupOrig = BATCH.find((f) => f.name === dup).size;
  ok(
    '高保真档压缩生效（结果 ≤ 原文件）',
    highSizes[dup] !== null && highSizes[dup] <= dupOrig && highSizes[dup] > 0,
    `原文件 ${(dupOrig / 1024).toFixed(1)}KB -> 高保真 ${(highSizes[dup] / 1024).toFixed(1)}KB（平衡档 ${(balancedSizes[dup] / 1024).toFixed(1)}KB）`,
  );

  await clickSegment(page, '极限');
  await waitBusyThenDone(page, 300_000);
  const extremeSize = parseBytes((await cardData(page, dup)).compressed);
  ok(
    '极限档 ≤ 平衡档（重复路径复用生效或取小）',
    extremeSize !== null && extremeSize <= balancedSizes[dup],
    `平衡 ${(balancedSizes[dup] / 1024).toFixed(1)}KB -> 极限 ${(extremeSize / 1024).toFixed(1)}KB`,
  );
  ok(
    '极限档 ≤ 高保真档',
    extremeSize !== null && extremeSize <= highSizes[dup],
    `高保真 ${(highSizes[dup] / 1024).toFixed(1)}KB -> 极限 ${(extremeSize / 1024).toFixed(1)}KB`,
  );

  // ---- 3. SVGZ 输出格式 + 预览 ----
  await clickSegment(page, 'SVGZ（gzip）');
  await waitBusyThenDone(page, 300_000);
  let svgzOk = true;
  const svgzDetails = [];
  const keptInSvgz = [];
  for (const f of BATCH) {
    const d = await cardData(page, f.name);
    const kept = /原文件已是最优/.test(d?.note ?? '');
    svgzDetails.push(`${f.name}:${d.format}${kept ? '(保留原文件)' : ''}`);
    if (kept) keptInSvgz.push(f.name);
    if (d.format !== 'SVGZ' && !kept) {
      svgzOk = false;
      failures.push(`SVGZ 输出失败: ${f.name} format=${d.format}`);
    }
  }
  ok('输出格式 SVGZ：全部卡片标注 SVGZ（保留原文件除外）', svgzOk, svgzDetails.join(' '));
  ok(
    '保留原文件策略生效并标注（SVGZ 档）',
    keptInSvgz.length > 0,
    keptInSvgz.length > 0 ? `保留原文件：${keptInSvgz.join(', ')}` : '本批文件在 SVGZ 档下均可被继续优化',
  );

  // ---- 4. 对比弹窗：视觉 + 源码 + 复制 ----
  const compareCard = page.locator('[class*="card"]').filter({ hasText: '底框.svg' });
  await compareCard.getByRole('button', { name: '对比', exact: true }).click();
  await page.locator('[class*="dialog"]').waitFor({ state: 'visible' });
  await page.locator('[class*="dialog"]').screenshot({ path: join(SHOT_DIR, 'svg-compare-visual.png') });
  const visualText = await page.locator('[class*="dialog"]').textContent();
  ok(
    '对比弹窗视觉标签可用',
    /视觉对比/.test(visualText ?? '') && /原文件/.test(visualText ?? '') && /压缩后/.test(visualText ?? ''),
    visualText?.replace(/\s+/g, ' ').trim().slice(0, 120),
  );

  await clickSegment(page, '优化后源码');
  const codeText = await page.locator('[class*="dialog"] pre').textContent();
  ok(
    '优化后源码标签展示 SVG 代码',
    (codeText ?? '').trim().startsWith('<svg'),
    `${(codeText ?? '').length} chars`,
  );
  await page.locator('[class*="dialog"]').getByRole('button', { name: '复制', exact: true }).click();
  await page.waitForTimeout(300);
  let clipboardText = '';
  try {
    clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  } catch {
    // 剪贴板权限被拒时跳过
  }
  ok(
    '复制按钮可复制优化后源码',
    clipboardText.trim().startsWith('<svg') && clipboardText === codeText,
    clipboardText ? `${clipboardText.length} chars` : '剪贴板不可读',
  );
  await page.locator('[class*="dialog"]').getByRole('button', { name: '✕' }).click();

  // ---- 5. ZIP 打包（svgz 格式下条目应为 .svgz + gzip 魔数） ----
  const zipPath = join(OUT_DIR, 'svgs.zip');
  const zipName = await downloadAllZip(page, zipPath);
  const entries = unzipSync(readFileSync(zipPath));
  const entryNames = Object.keys(entries).sort();
  let zipOk = true;
  // 默认文件名规则：原名（去扩展名）+ -compressed + 扩展名
  const applyNameRule = (name) => {
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    return `${base}-compressed${ext}`;
  };
  const expectedNames = [];
  for (const f of BATCH) {
    const d = await cardData(page, f.name);
    const kept = /原文件已是最优/.test(d?.note ?? '');
    if (kept) {
      expectedNames.push(applyNameRule(f.name)); // 保留原文件 → 仍按命名规则输出
    } else if (/\.svgz$/i.test(f.name)) {
      expectedNames.push(applyNameRule(f.name)); // svgz 输入 + svgz 输出 → 按命名规则输出
    } else {
      expectedNames.push(applyNameRule(f.name.replace(/\.svg$/i, '.svgz')));
    }
  }
  // 与 zip.ts uniqueName 相同的重名去重规则
  const used = new Set();
  const deduped = expectedNames.map((name) => {
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
  });
  expectedNames.length = 0;
  expectedNames.push(...deduped);
  expectedNames.sort();
  if (zipName !== 'compressed-svgs.zip' || entryNames.length !== BATCH.length) {
    zipOk = false;
    failures.push(`ZIP 名称/条目数不符: ${zipName} ${entryNames.length}`);
  } else if (entryNames.join(',') !== expectedNames.join(',')) {
    zipOk = false;
    failures.push(`ZIP 条目名不符: 期望=${expectedNames.join(',')} 实际=${entryNames.join(',')}`);
  } else {
    for (const [name, data] of Object.entries(entries)) {
      if (/\.svgz$/i.test(name) && !(data[0] === 0x1f && data[1] === 0x8b)) {
        zipOk = false;
        failures.push(`SVGZ 条目魔数错误: ${name}`);
      }
    }
  }
  ok(
    'ZIP 下载：compressed-svgs.zip，条目均为 .svgz 且 gzip 有效',
    zipOk,
    `entries=${entryNames.join(',')}`,
  );

  // ---- 6. 恢复 SVG 输出，下载单张 ----
  await clickSegment(page, 'SVG');
  await waitBusyThenDone(page, 300_000);

  // ---- 7. 异常输入：损坏 SVG / 超大 SVG / 非 SVG ----
  await page.setInputFiles('input[type="file"]', [join(FIXTURES, 'broken.svg')]);
  await page.waitForFunction(
    (name) => {
      const cards = Array.from(document.querySelectorAll('[class*="card"]'));
      const card = cards.find((c) => c.querySelector('[class*="name"]')?.textContent?.trim() === name);
      return card && (card.textContent.includes('完成') || card.textContent.includes('失败'));
    },
    'broken.svg',
    { timeout: 60_000 },
  );
  const broken = await cardData(page, 'broken.svg');
  ok(
    '损坏 SVG 明确报错（失败卡片）',
    broken?.status === '失败' && (broken?.error ?? '').length > 0,
    `${broken?.status} ${broken?.error}`,
  );

  await page.setInputFiles('input[type="file"]', [join(FIXTURES, 'big.svg')]);
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('[class*="notice"]')).some((e) => e.textContent.includes('文件过大')),
    undefined,
    { timeout: 15_000 },
  );
  const notice1 = await page.locator('[class*="notice"]').first().textContent();
  const bigCardCount = await page.locator('[class*="card"]').filter({ hasText: 'big.svg' }).count();
  ok(
    '超过 20MB 的 SVG 被忽略并提示',
    /文件过大/.test(notice1 ?? '') && bigCardCount === 0,
    notice1?.replace(/\s+/g, ' ').trim(),
  );

  await page.setInputFiles('input[type="file"]', [join(FIXTURES, 'tiny-test.svg')]);
  await page.waitForFunction(
    (name) => {
      const cards = Array.from(document.querySelectorAll('[class*="card"]'));
      const card = cards.find((c) => c.querySelector('[class*="name"]')?.textContent?.trim() === name);
      return card && (card.textContent.includes('完成') || card.textContent.includes('失败'));
    },
    'tiny-test.svg',
    { timeout: 60_000 },
  );
  const tiny = await cardData(page, 'tiny-test.svg');
  ok('正常小 SVG 可压缩', tiny?.status === '完成', `${tiny?.original} -> ${tiny?.compressed}`);

  await page.setInputFiles('input[type="file"]', [join(PICTURES, 'hh.png')]);
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('[class*="notice"]')).some((e) => e.textContent.includes('不是有效的 SVG')),
    undefined,
    { timeout: 15_000 },
  );
  const notice2 = await page.locator('[class*="notice"]').first().textContent();
  ok(
    '非 SVG 文件被忽略并提示',
    /不是有效的 SVG 文件/.test(notice2 ?? ''),
    notice2?.replace(/\s+/g, ' ').trim(),
  );

  // ---- 8. 桌面结果截图 ----
  await page.locator('[class*="card"]').filter({ hasText: 'broken.svg' }).first().waitFor({ state: 'visible' });
  await page.screenshot({ path: join(SHOT_DIR, 'svg-results.png') });

  // ---- 9. 移动端视口 ----
  const mobileCtx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  const mPage = await mobileCtx.newPage();
  mPage.on('pageerror', (e) => pageErrors.push(`svg mobile pageerror: ${e.message}`));
  await mPage.goto(BASE_URL, { waitUntil: 'networkidle' });
  await mPage.setInputFiles('input[type="file"]', [join(FIXTURES, 'tiny-test.svg')]);
  await allTerminal(mPage, 60_000);
  const overflow = await mPage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  ok(
    '移动端 375px：SVG 核心流程可用且无横向溢出',
    overflow <= 1,
    `overflow=${overflow}px`,
  );
  await mPage.screenshot({ path: join(SHOT_DIR, 'svg-mobile.png') });
  await mobileCtx.close();

  // ---- 10. 无外部请求 / 无页面错误 ----
  ok(
    '处理过程无外部网络请求',
    externalRequests.length === 0,
    externalRequests.join(', '),
  );
  ok('无页面/控制台错误', pageErrors.length === 0, pageErrors.join(' | '));

  await context.close();
} finally {
  await browser.close();
}

console.log(`\n===== SVG 压缩全量测试：${results.length - failures.length}/${results.length} 通过 =====`);
if (failures.length > 0) {
  console.log('\n失败项：');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('全部通过');
