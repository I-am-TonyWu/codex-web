const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = path.resolve(__dirname, '../output/playwright');
fs.mkdirSync(out, { recursive: true });
const base = process.env.MERMAID_TEST_URL || 'http://127.0.0.1:4173';
const url = base + '/tests/chat-composer-rendering/fixtures/mermaid.html';
const flow = 'flowchart TD\n A["初期输入<br/>电气参数与安装要求"] --> B["初期3D方案<br/>走向、固定与弯曲半径"]\n B --> C{"校核与评审<br/>干涉、装配与维修"}\n C -->|需修改| B\n C -->|通过| D["初版2D图纸"]\n D --> E["样机装配验证"]\n E --> F{"是否满足要求？"}\n F -->|否| G{"确定修改内容"}\n G -->|空间或固定问题| B\n G -->|图纸问题| D\n F -->|是| H["最终确认与发布"]';
const fenced = code => '```mermaid\n' + code + '\n```';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.MERMAID_BROWSER_CHANNEL || 'chrome' });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const errors = [], external = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.route('**/*', route => {
    const request = route.request();
    if (!request.url().startsWith(base)) { external.push(request.url()); return route.abort(); }
    if (new URL(request.url()).pathname.startsWith('/api/')) return route.fulfill({ json: { result: {} } });
    return route.continue();
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  const startupMermaidRequests = requests.filter(u => /node_modules.*mermaid|mermaid\.core/.test(u));
  // The application wrapper is small; the large library must load only for a visible diagram.
  assert.equal(startupMermaidRequests.length, 0);
  const set = async (text, messageType = '', extra = {}) => page.evaluate(({ text, messageType, extra }) => {
    window.mermaidTest.setMessages([{ id: 'testchat-mermaid', role: 'assistant', text, messageType, ...extra }]);
  }, { text, messageType, extra });
  const ready = () => page.locator('.mermaid-card[data-state="ready"] svg').first().waitFor({ timeout: 30000 });
  const top = () => page.locator('.conversation-list').evaluate(el => { el.scrollTop = 0; });
  const marker = 'TestChat-MERMAID-' + Date.now();
  const file = 'C:/TestChat/流程 100% #.txt';
  const firstRenderStarted = Date.now();
  await set(marker + '\n\n[测试文件](<' + file + '>)\n\n' + fenced(flow));
  await ready();
  const firstRenderMs = Date.now() - firstRenderStarted;
  const link = page.locator('.message-file-link').filter({ hasText: '测试文件' });
  const checks = await link.evaluate((el, file) => ({ hrefOk: decodeURIComponent(new URL(el.href).pathname.slice('/codex-local-browse/'.length)) === file, titleOk: el.title === file, textOk: el.textContent.trim() === '测试文件' }), file);
  assert.deepEqual(checks, { hrefOk: true, titleOk: true, textOk: true });
  assert.ok((await page.locator('.message-row').innerText()).includes(marker));
  assert.ok((await page.locator('.mermaid-diagram svg').textContent()).includes('初期输入'));
  assert.equal(await page.locator('.mermaid-diagram foreignObject').count(), 0);
  for (const size of [{ width: 375, height: 812 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(size);
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
      await ready(); await top(); await page.waitForTimeout(2200);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, 'Diagram must not overflow the whole page');
      await page.screenshot({ path: path.join(out, `testchat-mermaid-${size.width}-${dark ? 'dark' : 'light'}-cjs.png`) });
    }
  }
  await page.getByRole('button', { name: '查看代码', exact: true }).click();
  assert.ok((await page.locator('.mermaid-source').textContent()).includes('flowchart TD'));
  await page.getByRole('button', { name: '查看图表', exact: true }).click();
  await page.getByRole('button', { name: '放大', exact: true }).click();
  await page.getByRole('dialog', { name: '放大流程图' }).waitFor();
  const duplicateIds = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('.mermaid-card svg [id], .mermaid-modal svg [id], .mermaid-card svg[id], .mermaid-modal svg[id]')].map(e => e.id);
    return ids.length - new Set(ids).size;
  });
  assert.equal(duplicateIds, 0);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await set(fenced('flowchart TD\n A[unfinished'), 'agentMessage.live');
  await page.locator('.mermaid-card[data-state="pending"]').waitFor();
  assert.equal(await page.locator('.mermaid-error').count(), 0);
  // Finishing a stream can leave the text unchanged, so messageType must invalidate v-memo.
  await set(fenced(flow), 'agentMessage.live');
  await page.locator('.mermaid-card[data-state="pending"]').waitFor();
  await set(fenced(flow), 'agentMessage'); await ready();
  await set(fenced('flowchart TD\n A[unfinished')); await page.locator('.mermaid-card[data-state="error"]').waitFor();
  assert.ok((await page.locator('.mermaid-source').textContent()).includes('unfinished'));
  await set(fenced('sequenceDiagram\n participant 手机\n participant 主机\n 手机->>主机: 请求\n 主机-->>手机: 回复')); await ready();
  assert.ok((await page.locator('.mermaid-diagram svg').textContent()).includes('手机'));
  await set(fenced(flow), 'plan'); await ready();
  assert.equal(await page.locator('.message-mermaid-host .mermaid-card').count(), 1);
  await set(fenced(flow), 'plan.live'); await page.locator('.mermaid-card[data-state="pending"]').waitFor();
  await set(fenced(flow), 'plan'); await ready();
  await set('- 嵌套图表\n\n  ' + fenced(flow).replaceAll('\n', '\n  ')); await ready();
  await set('```javascript\nconsole.log("unchanged");\n```');
  assert.equal(await page.locator('.mermaid-card').count(), 0);
  assert.ok((await page.locator('.message-code-block').textContent()).includes('console.log'));
  const serviceChecks = await page.evaluate(async flow => {
    const test = window.mermaidTest;
    const fresh = flow + '\n Z[并发检查]';
    const coldStarted = performance.now();
    const one = test.renderMermaid(fresh, false), two = test.renderMermaid(fresh, false);
    const svg = await one;
    const coldMs = performance.now() - coldStarted;
    const cachedStarted = performance.now();
    const cached = await test.renderMermaid(fresh, false);
    const cachedMs = performance.now() - cachedStarted;
    let longRejected = false;
    try { await test.renderMermaid('x'.repeat(50001), false); } catch { longRejected = true; }
    const unsafe = await test.renderMermaid('flowchart LR\n A["<img src=x onerror=alert(1)>"] --> B[安全]\n click B "javascript:alert(1)"', false);
    const parsed = new DOMParser().parseFromString(unsafe, 'image/svg+xml');
    const maliciousAttributes = [...parsed.querySelectorAll('*')].some(el => [...el.attributes].some(a => a.name.startsWith('on') || (a.name.includes('href') && /javascript:/i.test(a.value))));
    return { shared: one === two, cached: cached === svg, longRejected, scripts: parsed.querySelectorAll('script, foreignObject, img').length, maliciousAttributes, coldMs, cachedMs };
  }, flow);
  assert.ok(serviceChecks.shared && serviceChecks.cached && serviceChecks.longRejected);
  assert.equal(serviceChecks.scripts, 0); assert.equal(serviceChecks.maliciousAttributes, false);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  const report = { url, viewports: ['375x812', '768x1024'], checks, serviceChecks, firstRenderMs, startupMermaidRequests, requests: requests.length, errors, external };
  fs.writeFileSync(path.join(out, 'mermaid-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
