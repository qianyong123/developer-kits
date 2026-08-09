/**
 * JSON 工具全量端到端测试（真实浏览器）
 *
 * 覆盖：
 *  - 格式化（缩进 2/4、排序键、unicode/转义）
 *  - 压缩
 *  - 校验（合法、重复键、数组不误报、各种语法错误行列定位）
 *  - 结构对比（增删改、数组、嵌套特殊键、类型变化、一侧非法、完全一致）
 *  - 导入文件（正常 + 超 5MB）、示例、复制、下载、清空
 *  - 移动端布局、无外部请求、无页面错误
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173/#/json';
const OUT_DIR = process.env.E2E_OUT_DIR ?? join(process.cwd(), '.e2e-out');
mkdirSync(OUT_DIR, { recursive: true });

const results = [];
const failures = [];
const pageErrors = [];
const externalRequests = [];

function ok(name, pass, detail = '') {
  results.push({ name, pass, detail });
  if (!pass) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? `  ${detail}` : ''}`);
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

  const modeBtn = (i) => page.locator('[class*="modes"] button').nth(i);
  const textarea = (i = 0) => page.locator('[class*="textarea"]').nth(i);
  const toolbarBtn = (i) => page.locator('[class*="toolbar"] button').nth(i);

  const outputText = () =>
    page.evaluate(() => document.querySelector('[class*="outputText"]')?.textContent ?? null);
  const viewerText = () =>
    page.evaluate(() => document.querySelector('[class*="jsonViewer"]')?.textContent ?? null);
  const errorState = () =>
    page.evaluate(() => ({
      invalid: document.querySelector('[class*="errorBox"] strong')?.textContent?.trim() ?? null,
      pos: document.querySelector('[class*="errorPos"]')?.textContent ?? null,
      msg: document.querySelector('[class*="errorMessage"]')?.textContent ?? null,
      side: document.querySelector('[class*="errorSide"]')?.textContent ?? null,
    }));
  const validState = () =>
    page.evaluate(() => ({
      title: document.querySelector('[class*="validTitle"]')?.textContent ?? null,
      warnings: document.querySelectorAll('[class*="warnings"] p').length,
    }));
  const diffState = () =>
    page.evaluate(() => ({
      summary: document.querySelector('[class*="diffSummary"]')?.textContent ?? null,
      rows: document.querySelectorAll('[class*="changeRow"]').length,
      none: document.querySelector('[class*="diffNone"]')?.textContent ?? null,
    }));
  const wait = (ms = 650) => page.waitForTimeout(ms);
  const startCompare = () => page.getByRole('button', { name: '开始对比', exact: true }).click();

  // ---- 1. 格式化 ----
  await modeBtn(0).click();
  await textarea().fill('{"b":1,"a":[1,2],"c":{"x":true}}');
  await wait();
  await page.waitForFunction(() => !!document.querySelector('[class*="jsonViewer"]'), undefined, {
    timeout: 10_000,
  });
  let text = await viewerText();
  ok(
    '格式化：树形视图渲染且包含各键值',
    text !== null &&
      text.includes('b:1') &&
      text.includes('a:[1,2]') &&
      text.includes('c:{x:true}') &&
      text.includes('true'),
    (text ?? '').slice(0, 80),
  );

  await page.locator('[class*="options"] button').nth(1).click(); // 缩进 4
  await wait();
  await page.locator('[class*="copyBtn"]').click(); // 复制格式化文本验证缩进
  await wait(300);
  const indentClipboard = await page.evaluate(() =>
    navigator.clipboard.readText().catch(() => ''),
  );
  ok('格式化：缩进 4 作用于输出文本', indentClipboard.includes('\n    "b"'), indentClipboard.slice(0, 40));

  await page.locator('[class*="checkbox"] input').check();
  await wait();
  text = await viewerText();
  ok(
    '格式化：排序键后 a 排在 b 前',
    text !== null && text.indexOf('a:[') < text.indexOf('b:1'),
    (text ?? '').slice(0, 40),
  );
  await page.locator('[class*="checkbox"] input').uncheck();

  await textarea().fill('{"zh":"\\u4e2d\\u6587","emoji":"🎉","nl":"a\\nb"}');
  await wait();
  text = await viewerText();
  ok(
    '格式化：unicode/emoji 在树形视图中正确显示',
    text !== null && text.includes('中文') && text.includes('🎉'),
    (text ?? '').slice(0, 80),
  );

  // ---- 2. 压缩 ----
  await modeBtn(1).click();
  await textarea().fill('{ "b" : 1, "a" : [ 1, 2 ] }');
  await wait();
  text = await outputText();
  ok('压缩：去除空白输出紧凑 JSON', text === '{"b":1,"a":[1,2]}', text ?? '');

  // ---- 3. 校验 ----
  await modeBtn(2).click();
  await textarea().fill('{"a":1,"b":2}');
  await wait();
  let v = await validState();
  ok('校验：合法 JSON 显示合法且无警告', v.title === '✓ JSON 合法' && v.warnings === 0, JSON.stringify(v));

  await textarea().fill('{"a":1,\n"a":2,\n"b":3}');
  await wait();
  v = await validState();
  ok('校验：重复键检测并给出行号', v.title === '✓ JSON 合法' && v.warnings === 1, JSON.stringify(v));

  await textarea().fill('{"o":{"x":1,"x":2},"a":["a","a"]}');
  await wait();
  v = await validState();
  ok('校验：嵌套重复键检出、数组字符串不误报', v.warnings === 1, JSON.stringify(v));

  const errorCases = [
    ['尾随逗号', '{"a":1,}', '期望', 1],
    ['属性值缺失', '{"a": 1, "b": }', '意外的字符', 1],
    ['单引号', "{'a': 1}", '期望属性键', 1],
    ['行尾注释', '{"a":1} // x', '意外的字符', 1],
    ['数字错误', '{"a": 1.}', '数字格式错误', 1],
    ['字符串未闭合', '{"a": "abc', '字符串未闭合', 1],
    ['多行错误定位', '{\n  "a": 1,\n  "b": }\n}', '意外的字符', 3],
  ];
  for (const [label, input, msgKeyword, line] of errorCases) {
    await textarea().fill(input);
    await wait();
    const e = await errorState();
    const pass =
      e.invalid === 'JSON 不合法' &&
      (e.msg ?? '').includes(msgKeyword) &&
      (e.pos ?? '').includes(`第 ${line} 行`);
    ok(`校验错误：${label}`, pass, JSON.stringify(e));
  }

  await textarea().fill('   ');
  await wait();
  const idleAfterEmpty = await page.evaluate(
    () => !!document.querySelector('[class*="placeholder"]'),
  );
  ok('校验：空输入不报错（待输入）', idleAfterEmpty);

  // ---- 4. 结构对比 ----
  await modeBtn(3).click();
  await textarea(0).fill('{"a":1,"b":2}');
  await textarea(1).fill('{"a":1,"c":3}');
  await startCompare();
  await wait(300);
  let d = await diffState();
  ok(
    '对比：对象增删',
    d.rows === 2 && (d.summary ?? '').includes('新增 1') && (d.summary ?? '').includes('删除 1'),
    JSON.stringify(d),
  );

  await textarea(0).fill('[1,2,3]');
  await textarea(1).fill('[1,2]');
  await startCompare();
  await wait(300);
  d = await diffState();
  ok('对比：数组删除尾部元素', d.rows === 1 && (d.summary ?? '').includes('删除 1'), JSON.stringify(d));

  await textarea(0).fill('{"a":"1"}');
  await textarea(1).fill('{"a":1}');
  await startCompare();
  await wait(300);
  d = await diffState();
  ok('对比：类型变化记为修改', d.rows === 1 && (d.summary ?? '').includes('修改 1'), JSON.stringify(d));

  await textarea(0).fill('{"a.b":{"x":[1]}}');
  await textarea(1).fill('{"a.b":{"x":[1,2]}}');
  await startCompare();
  await wait(300);
  const specialPath = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="changePath"]'));
    return rows.map((r) => r.textContent).join(',');
  });
  ok('对比：嵌套特殊键名路径', specialPath === '$["a.b"].x[1]', specialPath);

  await textarea(0).fill('{"a":1}');
  await textarea(1).fill('{"a":1}');
  await startCompare();
  await wait(300);
  d = await diffState();
  ok('对比：完全一致', d.rows === 0 && d.none !== null, JSON.stringify(d));

  await textarea(0).fill('{"a":1}');
  await textarea(1).fill('{bad}');
  await startCompare();
  await wait(300);
  const sideError = await errorState();
  ok('对比：右侧非法时标注错误侧', sideError.invalid === 'JSON 不合法' && sideError.side !== null, JSON.stringify(sideError));

  // ---- 5. 导入文件 ----
  const fixtureDir = join(process.env.TEMP ?? 'C:\\Users\\52514\\AppData\\Local\\Temp', 'devkits-json-fixtures');
  mkdirSync(fixtureDir, { recursive: true });
  const smallJson = join(fixtureDir, 'sample.json');
  writeFileSync(smallJson, '{"hello": "world", "n": 42}');
  const bigJson = join(fixtureDir, 'big.json');
  writeFileSync(bigJson, `{"padding": "${'x'.repeat(6 * 1024 * 1024)}"}`);

  await modeBtn(1).click(); // 压缩模式
  await page.setInputFiles('input[type="file"]', smallJson);
  await wait();
  text = await outputText();
  ok('导入文件：读取并处理', text === '{"hello":"world","n":42}', text ?? '');

  await page.setInputFiles('input[type="file"]', bigJson);
  await wait();
  const tooLarge = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[class*="notice"]')).some((e) => e.textContent.includes('5MB')),
  );
  ok('导入文件：超过 5MB 提示并忽略', tooLarge);

  // ---- 6. 示例 / 清空 ----
  await toolbarBtn(1).click(); // 示例
  await wait();
  const sampleLoaded = await page.evaluate(() => {
    const ta = document.querySelector('[class*="textarea"]');
    return ta && ta.value.includes('开发工具包');
  });
  ok('示例：加载示例 JSON', sampleLoaded);

  await toolbarBtn(3).click(); // 清空（导入 0 · 示例 1 · 下载 2 · 清空 3）
  await wait();
  const cleared = await page.evaluate(
    () => document.querySelector('[class*="textarea"]')?.value === '' && !!document.querySelector('[class*="placeholder"]'),
  );
  ok('清空：输入与输出复位', cleared);

  // ---- 7. 复制 / 下载 ----
  await textarea().fill('{"a":1}');
  await wait();
  await page.locator('[class*="copyBtn"]').click(); // 输出面板内的复制按钮
  await wait(300);
  const toastText = await page.evaluate(() =>
    document.querySelector('[class*="toast"]')?.textContent ?? null,
  );
  const clipboard = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(
    '复制：输出写入剪贴板且弹出成功提示',
    clipboard === '{"a":1}' && (toastText ?? '').includes('复制成功'),
    `clipboard=${clipboard.slice(0, 40)} toast=${toastText}`,
  );

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    toolbarBtn(2).click(), // 导入 0 · 示例 1 · 下载 2 · 清空 3
  ]);
  const downloadPath = join(OUT_DIR, 'json-download.json');
  await download.saveAs(downloadPath);
  const downloaded = readFileSync(downloadPath, 'utf8');
  ok(
    '下载：文件名与内容正确',
    download.suggestedFilename() === 'minified.json' && downloaded === '{"a":1}',
    `${download.suggestedFilename()} / ${downloaded.slice(0, 40)}`,
  );

  // ---- 8. 桌面截图 ----
  await toolbarBtn(1).click();
  await wait();
  await page.screenshot({ path: join(OUT_DIR, 'shots', 'json-e2e.png') });

  // ---- 9. 移动端 ----
  const mobileCtx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  const mPage = await mobileCtx.newPage();
  mPage.on('pageerror', (e) => pageErrors.push(`json mobile pageerror: ${e.message}`));
  await mPage.goto(BASE_URL, { waitUntil: 'networkidle' });
  await mPage.locator('[class*="toolbar"] button').nth(1).click();
  await mPage.waitForTimeout(700);
  const mobile = await mPage.evaluate(() => {
    const ta = document.querySelector('[class*="textarea"]');
    const out = document.querySelector('[class*="output"]');
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      singleColumn: ta ? Math.round(ta.getBoundingClientRect().width) >= 330 : false,
      stacked: out && ta ? out.getBoundingClientRect().top > ta.getBoundingClientRect().top : false,
    };
  });
  ok(
    '移动端：单列堆叠且无横向溢出',
    mobile.overflow <= 1 && mobile.singleColumn && mobile.stacked,
    JSON.stringify(mobile),
  );
  await mobileCtx.close();

  // ---- 10. 网络与错误 ----
  ok('无外部网络请求', externalRequests.length === 0, externalRequests.join(','));
  ok('无页面/控制台错误', pageErrors.length === 0, pageErrors.join(' | '));

  await context.close();
} finally {
  await browser.close();
}

console.log(`\n===== JSON 工具全量测试：${results.length - failures.length}/${results.length} 通过 =====`);
if (failures.length > 0) {
  console.log('\n失败项：');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('全部通过');
