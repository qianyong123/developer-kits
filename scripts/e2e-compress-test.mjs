/**
 * 端到端压缩冒烟测试：用 Playwright 驱动真实浏览器，
 * 把 test-images 下的图片依次拖进工具，检查是否正常压缩。
 *
 * 用法：
 *   npm run dev        # 先启动开发服务器
 *   node scripts/e2e-compress-test.mjs
 */
import { statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173/';
const IMAGE_DIR = join(process.cwd(), 'test-images');
const TARGET_MODE_FILE = 'photo-png.png';
const TARGET_KB = 100;

const files = readdirSync(IMAGE_DIR)
  .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
  .map((f) => ({ name: f, path: join(IMAGE_DIR, f), size: statSync(join(IMAGE_DIR, f)).size }));

const results = [];
const pageErrors = [];

function parseCard(text) {
  const original = /原图:\s*([\d.]+)\s*(B|KB|MB)/.exec(text);
  const compressed = /压缩后:\s*([\d.]+)\s*(B|KB|MB)/.exec(text);
  const status = text.includes('失败') ? 'error' : text.includes('完成') ? 'done' : 'unknown';
  const note = text.includes('无法达标')
    ? '无法达标'
    : text.includes('原图已是最优')
      ? '保留原图'
      : text.includes('提示')
        ? '提示'
        : '';
  return {
    original: original ? `${original[1]} ${original[2]}` : '?',
    compressed: compressed ? `${compressed[1]} ${compressed[2]}` : '?',
    status,
    note,
  };
}

async function waitCardDone(page, filename, timeout = 180_000) {
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

  for (const file of files) {
    const t0 = Date.now();
    await page.setInputFiles('input[type="file"]', file.path);
    await waitCardDone(page, file.name);
    const card = await readCard(page, file.name);
    results.push({ file: file.name, originalBytes: file.size, ...card, ms: Date.now() - t0 });
  }

  // 目标体积模式：photo-png.png → 100KB
  await page.locator('input[name="mode"]').nth(1).check();
  await page.locator('#target-kb').fill(String(TARGET_KB));
  // 等设置生效并重新压缩（先出现待处理/压缩中，再等完成）
  await page.waitForFunction(
    (name) => {
      const cards = Array.from(document.querySelectorAll('[class*="card"]'));
      const card = cards.find((c) => c.textContent.includes(name));
      return card && (card.textContent.includes('待处理') || card.textContent.includes('压缩中'));
    },
    TARGET_MODE_FILE,
    { timeout: 30_000 },
  );
  await waitCardDone(page, TARGET_MODE_FILE);
  const targetCard = await readCard(page, TARGET_MODE_FILE);
  results.push({
    file: `${TARGET_MODE_FILE}（目标体积 ${TARGET_KB}KB）`,
    originalBytes: files.find((f) => f.name === TARGET_MODE_FILE).size,
    ...targetCard,
    ms: 0,
  });
} finally {
  await browser.close();
}

console.log('\n===== 压缩测试结果 =====');
for (const r of results) {
  const ok = r.status === 'done' ? '完成' : '失败';
  console.log(
    `${ok}  ${r.file.padEnd(38)} 原图 ${r.original}  →  压缩后 ${r.compressed}  ${r.note}`.trim(),
  );
}

if (pageErrors.length > 0) {
  console.log('\n===== 页面错误 =====');
  for (const e of pageErrors) console.log(e);
} else {
  console.log('\n无页面/控制台错误');
}

const failed = results.some((r) => r.status !== 'done');
console.log(`\n${failed ? '存在失败项' : '全部通过'}`);
process.exit(failed ? 1 : 0);
