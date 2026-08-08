/**
 * SVG 压缩端到端冒烟测试：用 Playwright 驱动真实浏览器，
 * 上传 test-images 下的 SVG，验证压缩、极限档、对比源码与 ZIP 下载。
 *
 * 用法：
 *   npm run dev        # 先启动开发服务器
 *   node scripts/e2e-svg-test.mjs
 */
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173/#/svg';
const IMAGE_DIR = join(process.cwd(), 'test-images');

const files = ['icon-bloated.svg', 'icon-set-duplicates.svg'].map((name) => ({
  name,
  path: join(IMAGE_DIR, name),
  size: statSync(join(IMAGE_DIR, name)).size,
}));

const results = [];
const pageErrors = [];

function parseBytes(text) {
  const m = /(\d[\d.]*)\s*(B|KB|MB)/.exec(text);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2];
  return unit === 'B' ? n : unit === 'KB' ? n * 1024 : n * 1024 * 1024;
}

function parseCard(text) {
  const sizes = /(\d[\d.]*)\s*(B|KB|MB)\s*(\d[\d.]*)\s*(B|KB|MB)/.exec(text);
  const status = text.includes('失败')
    ? 'error'
    : text.includes('完成')
      ? 'done'
      : 'unknown';
  return {
    original: sizes ? `${sizes[1]} ${sizes[2]}` : '?',
    compressed: sizes ? `${sizes[3]} ${sizes[4]}` : '?',
    status,
    note: text.includes('保留原文件') ? '保留原文件' : '',
  };
}

async function waitCardDone(page, filename, timeout = 120_000) {
  await page.waitForFunction(
    (name) => {
      const cards = Array.from(document.querySelectorAll('[class*="card"]'));
      const card = cards.find((c) => c.textContent.includes(name));
      if (!card) return false;
      return card.textContent.includes('完成') || card.textContent.includes('失败');
    },
    filename,
    { timeout },
  );
}

async function readCard(page, filename) {
  const text = await page.evaluate((name) => {
    const cards = Array.from(document.querySelectorAll('[class*="card"]'));
    const card = cards.find((c) => c.textContent.includes(name));
    return card ? card.textContent : '';
  }, filename);
  return parseCard(text);
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`);
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // 1. 上传全部 SVG，等待压缩完成
  await page.setInputFiles('input[type="file"]', files.map((f) => f.path));
  for (const file of files) {
    const t0 = Date.now();
    await waitCardDone(page, file.name);
    const card = await readCard(page, file.name);
    results.push({ file: file.name, originalBytes: file.size, ...card, ms: Date.now() - t0 });
  }

  // 2. 切换到“极限”档，验证自动重新压缩（重复路径场景应更小）
  await page.getByRole('button', { name: '极限', exact: true }).click();
  await page.waitForFunction(
    (name) => {
      const cards = Array.from(document.querySelectorAll('[class*="card"]'));
      const card = cards.find((c) => c.textContent.includes(name));
      return card && (card.textContent.includes('待处理') || card.textContent.includes('压缩中'));
    },
    'icon-set-duplicates.svg',
    { timeout: 30_000 },
  );
  await waitCardDone(page, 'icon-set-duplicates.svg');
  const extremeCard = await readCard(page, 'icon-set-duplicates.svg');
  results.push({
    file: 'icon-set-duplicates.svg（极限档）',
    originalBytes: files.find((f) => f.name === 'icon-set-duplicates.svg').size,
    ...extremeCard,
    ms: 0,
  });
  const balancedBytes = parseBytes(
    results.find((r) => r.file === 'icon-set-duplicates.svg').compressed,
  );
  const extremeBytes = parseBytes(extremeCard.compressed);
  if (balancedBytes !== null && extremeBytes !== null && extremeBytes >= balancedBytes) {
    pageErrors.push('极限档未比平衡档更小（路径复用未生效）');
  }

  // 3. 打开对比弹窗，切到“优化后源码”标签
  const cardEl = page.locator('[class*="card"]').filter({ hasText: 'icon-bloated.svg' });
  await cardEl.getByRole('button', { name: '对比', exact: true }).click();
  await page.getByRole('button', { name: '优化后源码', exact: true }).click();
  const codeText = await page.locator('pre').first().textContent();
  if (!codeText || !codeText.includes('<svg')) {
    pageErrors.push('对比弹窗源码标签未展示 SVG 代码');
  }
  await page.locator('[class*="dialog"]').getByRole('button', { name: '✕' }).click();

  // 4. 下载全部 ZIP
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.getByRole('button', { name: '下载全部 (ZIP)', exact: true }).click(),
  ]);
  const zipName = download.suggestedFilename();
  results.push({
    file: `ZIP 下载（${zipName}）`,
    originalBytes: 0,
    original: '-',
    compressed: '-',
    status: zipName === 'compressed-svgs.zip' ? 'done' : 'error',
    note: '',
    ms: 0,
  });
} finally {
  await browser.close();
}

console.log('\n===== SVG 压缩测试结果 =====');
for (const r of results) {
  const ok = r.status === 'done' ? '完成' : '失败';
  console.log(
    `${ok}  ${r.file.padEnd(40)} 原图 ${r.original}  →  压缩后 ${r.compressed}  ${r.note}`.trim(),
  );
}

if (pageErrors.length > 0) {
  console.log('\n===== 页面错误 =====');
  for (const e of pageErrors) console.log(e);
} else {
  console.log('\n无页面/控制台错误');
}

const failed = results.some((r) => r.status !== 'done') || pageErrors.length > 0;
console.log(`\n${failed ? '存在失败项' : '全部通过'}`);
process.exit(failed ? 1 : 0);
