/**
 * JSON 工具全量端到端测试（Playwright Test）
 *
 * 覆盖：格式化（缩进/排序键/解包/宽松模式）、压缩、校验（重复键/大数/行列定位）、
 * 结构对比（LCS/增删改/一侧非法）、类型生成、导入/示例/复制/下载/清空、移动端布局、
 * 无外部请求与页面错误。
 *
 * 当前 UI 约定（适配 CodeMirror 迁移后的结构）：
 * - 顶部模式：0=格式化校验（处理模式）、1=对比、2=类型转换；
 * - 处理模式输入为 CodeMirror，动作（格式化/压缩/校验）需点击按钮触发；
 * - 对比/类型模式输入为 textarea。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const OUT_DIR = join(process.cwd(), '.e2e-out');
mkdirSync(OUT_DIR, { recursive: true });

test('JSON 工具全量测试', { timeout: 240_000 }, async ({ browser }) => {
  const results = [];
  const failures = [];
  const pageErrors = [];
  const externalRequests = [];

  const ok = (name, pass, detail = '') => {
    results.push({ name, pass, detail });
    if (!pass) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? `  ${detail}` : ''}`);
  };

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

  await page.goto('http://127.0.0.1:5173/#/json', { waitUntil: 'networkidle' });

  const modeBtn = (i) => page.locator('[class*="modes"] button').nth(i);
  const actionBtn = (name) => page.getByRole('button', { name, exact: true });
  const textarea = (i = 0) => page.locator('[class*="textarea"]').nth(i);
  const toolbarBtn = (i) => page.locator('[class*="toolbar"] button').nth(i);
  const copyBtn = () => page.getByRole('button', { name: '复制', exact: true });

  // CodeMirror 输入（处理模式）：全选清空后插入文本
  const fillCm = async (text) => {
    const cm = page.locator('[class*="cm-content"]');
    await cm.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(text);
    // 等待 CodeMirror onChange 同步到 store，避免动作按钮读到旧输入
    await page.waitForTimeout(150);
  };
  const cmText = () => page.locator('[class*="cm-content"]').innerText();

  const outputText = () =>
    page.evaluate(() => document.querySelector('[class*="outputText"]')?.textContent ?? null);
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
      stats: document.querySelector('[class*="diffStats"]')?.textContent ?? null,
      rows: document.querySelectorAll('[class*="changeRow"]').length,
      none: document.querySelector('[class*="diffNone"]')?.textContent ?? null,
    }));
  const wait = (ms = 650) => page.waitForTimeout(ms);
  const startCompare = () => page.getByRole('button', { name: '开始对比', exact: true }).click();

  // ---- 1. 格式化（缩进/排序键/中文与 emoji） ----
  await modeBtn(0).click();
  await fillCm('{"b":1,"a":[1,2],"c":{"x":true}}');
  await actionBtn('格式化').click();
  await wait();
  let text = await cmText();
  ok(
    '格式化：写入带缩进的 JSON',
    text.includes('"b": 1') && text.includes('"a": [') && text.includes('\n'),
    text.slice(0, 80),
  );

  await page.locator('[class*="options"] button').nth(1).click(); // 缩进 4
  await actionBtn('格式化').click();
  await wait();
  await copyBtn().click();
  await wait(300);
  const indentClipboard = await page.evaluate(() =>
    navigator.clipboard.readText().catch(() => ''),
  );
  ok('格式化：缩进 4 作用于输出文本', indentClipboard.includes('\n    "b"'), indentClipboard.slice(0, 40));

  await page.locator('[class*="checkbox"] input').nth(0).check(); // 排序键
  await actionBtn('格式化').click();
  await wait();
  text = await cmText();
  ok(
    '格式化：排序键后 a 排在 b 前',
    text.indexOf('"a"') < text.indexOf('"b"'),
    text.slice(0, 40),
  );
  await page.locator('[class*="checkbox"] input').nth(0).uncheck();

  await fillCm('{"zh":"\\u4e2d\\u6587","emoji":"🎉","nl":"a\\nb"}');
  await actionBtn('格式化').click();
  await wait();
  text = await cmText();
  ok(
    '格式化：中文与 emoji 正确显示',
    text.includes('中文') && text.includes('🎉'),
    text.slice(0, 80),
  );

  // 主题切换：CodeMirror 编辑器背景即时同步，无需切换导航重挂载
  const editorBg = () =>
    page.evaluate(() => {
      const cm = document.querySelector('[class*="cm-editor"]');
      return cm ? getComputedStyle(cm).backgroundColor : null;
    });
  const lightEditorBg = await editorBg();
  await page.locator('aside [class*="themeToggle"]').first().click();
  await wait(300);
  const darkEditorBg = await editorBg();
  ok(
    '主题切换：JSON 编辑器背景即时同步',
    lightEditorBg !== null &&
      darkEditorBg !== null &&
      lightEditorBg !== darkEditorBg,
    `${lightEditorBg} -> ${darkEditorBg}`,
  );
  await page.locator('aside [class*="themeToggle"]').first().click();
  await wait(300);

  // ---- 2. 压缩 ----
  await fillCm('{ "b" : 1, "a" : [ 1, 2 ] }');
  await actionBtn('压缩').click();
  await wait();
  text = await cmText();
  ok('压缩：去除空白输出紧凑 JSON', text === '{"b":1,"a":[1,2]}', text ?? '');

  // ---- 3. 校验 ----
  await fillCm('{"a":1,"b":2}');
  await actionBtn('校验').click();
  await wait();
  let v = await validState();
  ok('校验：合法 JSON 显示合法且无警告', v.title === '✓ JSON 合法' && v.warnings === 0, JSON.stringify(v));

  await fillCm('{"a":1,\n"a":2,\n"b":3}');
  await actionBtn('校验').click();
  await wait();
  v = await validState();
  ok('校验：重复键检测并给出行号', v.title === '✓ JSON 合法' && v.warnings === 1, JSON.stringify(v));

  await fillCm('{"o":{"x":1,"x":2},"a":["a","a"]}');
  await actionBtn('校验').click();
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
    await fillCm(input);
    await actionBtn('校验').click();
    await wait();
    const e = await errorState();
    ok(
      `校验错误：${label}`,
      e.invalid === 'JSON 不合法' &&
        (e.msg ?? '').includes(msgKeyword) &&
        (e.pos ?? '').includes(`第 ${line} 行`),
      JSON.stringify(e),
    );
  }

  await fillCm('{"a": 9007199254740993}');
  await actionBtn('校验').click();
  await wait();
  const bigNumWarn = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[class*="warnings"]')).some((e) =>
      e.textContent.includes('大数'),
    ),
  );
  ok('校验：大数精度提示', bigNumWarn);

  // 自动解包默认开启：带引号的 JSON 字符串按内层 JSON 校验
  await fillCm('"{\\"a\\":1}"');
  await actionBtn('校验').click();
  await wait();
  v = await validState();
  ok(
    '校验：自动解包默认开启，带引号 JSON 按内层校验',
    v.title === '✓ JSON 合法' && v.warnings === 0,
    JSON.stringify(v),
  );

  // ---- 4. 宽松模式（JSONC） ----
  await page.locator('[class*="checkbox"] input').nth(1).check(); // 宽松模式
  await fillCm('{ a: 1, // 注释\n  b: [1, 2,], }');
  await actionBtn('格式化').click();
  await wait();
  text = await cmText();
  ok(
    '宽松模式：JSONC 解析并格式化',
    text.includes('"a": 1') && text.includes('"b": ['),
    text.slice(0, 60),
  );
  await page.locator('[class*="checkbox"] input').nth(1).uncheck();

  // ---- 5. 类型生成 ----
  await modeBtn(2).click();
  await textarea().fill('{"name":"devkits","stats":{"n":1}}');
  await wait();
  text = await outputText();
  ok(
    '类型生成：输出 TS 接口',
    text !== null && text.includes('export interface Root') && text.includes('stats: RootStats'),
    (text ?? '').slice(0, 80),
  );

  // ---- 6. 结构对比 ----
  await modeBtn(1).click();
  await textarea(0).fill('{"a":1,"b":2}');
  await textarea(1).fill('{"a":1,"c":3}');
  await startCompare();
  await wait(300);
  let d = await diffState();
  ok(
    '对比：对象增删',
    d.rows === 2 && (d.stats ?? '').includes('+1 新增') && (d.stats ?? '').includes('-1 删除'),
    JSON.stringify(d),
  );

  await textarea(0).fill('[1,3]');
  await textarea(1).fill('[1,2,3]');
  await startCompare();
  await wait(300);
  d = await diffState();
  ok(
    '对比：数组按索引对比，中间插入显示为修改+新增',
    d.rows === 2 && (d.stats ?? '').includes('~1 修改') && (d.stats ?? '').includes('+1 新增'),
    JSON.stringify(d),
  );

  await textarea(0).fill('{"a":"1"}');
  await textarea(1).fill('{"a":1}');
  await startCompare();
  await wait(300);
  d = await diffState();
  ok('对比：类型变化记为修改', d.rows === 1 && (d.stats ?? '').includes('~1 修改'), JSON.stringify(d));

  await textarea(0).fill('{"a.b":{"x":[1]}}');
  await textarea(1).fill('{"a.b":{"x":[1,2]}}');
  await startCompare();
  await wait(300);
  const specialPath = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[class*="changePath"]'))
      .map((r) => r.textContent)
      .join(','),
  );
  ok('对比：嵌套特殊键名路径', specialPath === '["a.b"].x[1]', specialPath);

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

  // 对比复制/下载前校验选中项
  await textarea(0).fill('{"a":1,"b":2}');
  await textarea(1).fill('{"a":1,"c":3}');
  await startCompare();
  await wait(300);
  await page.getByRole('checkbox', { name: '全选', exact: true }).click();
  await page.getByRole('button', { name: '复制结果', exact: true }).click();
  await wait(300);
  const noSelCopy = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="alertdialog"]')).some((e) =>
      e.textContent.includes('要复制的内容'),
    ),
  );
  ok('对比复制：未选中时弹框提示且不复制', noSelCopy);
  await page.getByRole('button', { name: '知道了', exact: true }).click();

  await page.locator('[class*="changeCheckbox"]').nth(0).click();
  await page.getByRole('button', { name: '复制结果', exact: true }).click();
  await wait(300);
  const selectedClipboard = await page.evaluate(() =>
    navigator.clipboard.readText().catch(() => ''),
  );
  ok(
    '对比复制：仅复制选中的差异项',
    !selectedClipboard.includes('\n') && /^[+\-~]/.test(selectedClipboard),
    selectedClipboard.slice(0, 60),
  );

  await page.locator('[class*="changeCheckbox"]').nth(0).click(); // 取消选中，回到未选中状态
  const noDownload = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(true), 1500);
    page.once('download', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
  await toolbarBtn(2).click();
  await wait(300);
  const noSelDownload = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="alertdialog"]')).some((e) =>
      e.textContent.includes('要下载的内容'),
    ),
  );
  ok('对比下载：未选中时弹框提示且不下载', (await noDownload) && noSelDownload);
  await page.getByRole('button', { name: '知道了', exact: true }).click();

  await page.locator('[class*="changeCheckbox"]').nth(0).click();
  const [diffDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    toolbarBtn(2).click(),
  ]);
  const diffDownloadPath = join(OUT_DIR, 'json-diff.txt');
  await diffDownload.saveAs(diffDownloadPath);
  const downloadedDiff = readFileSync(diffDownloadPath, 'utf8');
  ok(
    '对比下载：内容为选中的差异项',
    diffDownload.suggestedFilename() === 'json-diff.txt' &&
      downloadedDiff.split('\n').length === 1 &&
      downloadedDiff.length > 0,
    `${diffDownload.suggestedFilename()} / ${downloadedDiff.slice(0, 60)}`,
  );

  // ---- 7. 导入文件 ----
  const fixtureDir = join(process.env.TEMP ?? 'C:\\Users\\52514\\AppData\\Local\\Temp', 'devkits-json-fixtures');
  mkdirSync(fixtureDir, { recursive: true });
  const smallJson = join(fixtureDir, 'sample.json');
  writeFileSync(smallJson, '{"hello": "world", "n": 42}');
  const bigJson = join(fixtureDir, 'big.json');
  writeFileSync(bigJson, `{"padding": "${'x'.repeat(6 * 1024 * 1024)}"}`);

  await modeBtn(0).click();
  await page.setInputFiles('input[type="file"]', smallJson);
  await actionBtn('压缩').click();
  await wait();
  text = await cmText();
  ok('导入文件：读取并处理', text === '{"hello":"world","n":42}', text ?? '');

  await page.setInputFiles('input[type="file"]', bigJson);
  await wait();
  const tooLarge = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[class*="notice"]')).some((e) => e.textContent.includes('5MB')),
  );
  ok('导入文件：超过 5MB 提示并忽略', tooLarge);

  // ---- 8. 示例 / 清空 / 复制 / 下载 ----
  await toolbarBtn(1).click();
  await wait();
  const sampleLoaded = await page.evaluate(() => {
    const cm = document.querySelector('[class*="cm-content"]');
    return !!cm && cm.textContent.includes('"name": "砺"');
  });
  ok('示例：加载示例 JSON', sampleLoaded);

  await toolbarBtn(3).click();
  await wait();
  const cleared = await page.evaluate(() => {
    // 清空后 CodeMirror 为空文档，显示占位符
    return !!document.querySelector('[class*="cm-placeholder"]');
  });
  ok('清空：输入复位', cleared);

  await fillCm('{"a":1}');
  await wait();
  await copyBtn().click();
  await wait(300);
  const toastText = await page.evaluate(() =>
    document.querySelector('[class*="toast"]')?.textContent ?? null,
  );
  const clipboard = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(
    '复制：输入写入剪贴板且弹出成功提示',
    clipboard === '{"a":1}' && (toastText ?? '').includes('复制成功'),
    `clipboard=${clipboard.slice(0, 40)} toast=${toastText}`,
  );

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    toolbarBtn(2).click(),
  ]);
  const downloadPath = join(OUT_DIR, 'json-download.json');
  await download.saveAs(downloadPath);
  const downloaded = readFileSync(downloadPath, 'utf8');
  ok(
    '下载：文件名与内容正确',
    download.suggestedFilename() === 'minified.json' && downloaded === '{"a":1}',
    `${download.suggestedFilename()} / ${downloaded.slice(0, 40)}`,
  );

  // ---- 9. 移动端 ----
  const mobileCtx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  const mPage = await mobileCtx.newPage();
  mPage.on('pageerror', (e) => pageErrors.push(`json mobile pageerror: ${e.message}`));
  await mPage.goto('http://127.0.0.1:5173/#/json', { waitUntil: 'networkidle' });
  await mPage.locator('[class*="toolbar"] button').nth(1).click();
  await mPage.waitForTimeout(700);
  const mobile = await mPage.evaluate(() => {
    const box = document.querySelector('[class*="cmBox"]');
    const viewport = document.documentElement.clientWidth;
    return {
      overflow: document.documentElement.scrollWidth - viewport,
      // 单列判断：编辑器占据视口 60% 以上（双列布局时每列约一半）
      singleColumn: box ? box.getBoundingClientRect().width > viewport * 0.6 : false,
    };
  });
  ok(
    '移动端：单列编辑器且无横向溢出',
    mobile.overflow <= 1 && mobile.singleColumn,
    JSON.stringify(mobile),
  );
  await mobileCtx.close();

  // ---- 10. 网络与错误 ----
  ok('无外部网络请求', externalRequests.length === 0, externalRequests.join(','));
  ok('无页面/控制台错误', pageErrors.length === 0, pageErrors.join(' | '));

  await context.close();

  console.log(`\n===== JSON 工具全量测试：${results.length - failures.length}/${results.length} 通过 =====`);
  expect(failures, failures.length ? `失败项：\n${failures.map((f) => `  - ${f}`).join('\n')}` : undefined).toEqual([]);
  expect(pageErrors).toEqual([]);
});
