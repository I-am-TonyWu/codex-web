const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.WRITER_TEST_URL || 'http://127.0.0.1:4195';
const screenshots = process.env.WRITER_SCREENSHOT_DIR;
(async () => {
 const browser = await chromium.launch({ headless: true, channel: 'chrome' });
 let scenarios = 0;
 try {
  for (const theme of ['light', 'dark']) for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }]) {
   const context = await browser.newContext({ viewport, colorScheme: theme });
   await context.addInitScript(scheme => { localStorage.setItem('codex-web-local.ui-language.v1', 'zh-CN'); localStorage.setItem('codex-ui-theme', scheme); }, theme);
   const a = await context.newPage(), b = await context.newPage();
   const errors = [], writes = [], resumes = [];
   const id = '22222222-2222-4222-8222-222222222222';
   const thread = { id, name: '多端交接验证', preview: '保留原对话', cwd: 'C:/Fixture', createdAt: 1760000000, updatedAt: 1760000100, source: 'appServer', status: { type: 'notLoaded' }, turns: [{ id: 'history', status: 'completed', items: [{ id: 'history-message', type: 'agentMessage', text: '已有历史保留，接管不自动发送草稿。' }] }] };
   const state = { threadId: id, epoch: 'fixture', version: 0, owner: null, token: null, activity: 'idle', turnId: null, transferring: false, desktopReleaseAvailable: false };
   const view = label => ({ ...state, proof: state.owner?.id === label ? { epoch: 'fixture', version: state.version, token: state.token } : null });
   for (const [page, label] of [[a, 'A'], [b, 'B']]) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.route('**/codex-api/**', async route => {
     const pathname = new URL(route.request().url()).pathname;
     const body = route.request().postData() ? route.request().postDataJSON() : null;
     let json = { data: [], result: {}, accounts: [], titles: {}, pins: [], prompts: [] };
     if (pathname.startsWith('/codex-api/control/')) {
      if (pathname.endsWith('/register')) json = { data: { id: label, key: 'key-' + label } };
      else {
       if (pathname.endsWith('/claim')) { state.version++; state.owner = { id: label, label: '网页 ' + label }; state.token = 'token-' + state.version; if (body.stop) { state.activity = 'idle'; state.turnId = null; } }
       if (pathname.endsWith('/release')) { state.version++; state.owner = null; state.token = null; }
       json = { data: view(label) };
      }
     }
     if (pathname === '/codex-api/thread-titles') json = { data: { titles: { [id]: thread.name }, order: [id] } };
     if (pathname === '/codex-api/workspace-roots-state') json = { data: { order: [], labels: {}, active: [], localProjects: [] } };
     if (pathname === '/codex-api/rpc') {
      const { method, params } = body; let result = {};
      if (method === 'thread/list') result = { data: [thread], nextCursor: null };
      if (method === 'thread/read' || method === 'thread/resume') { result = { thread }; if (method === 'thread/resume') resumes.push(label); }
      if (method === 'model/list') result = { data: [{ id: 'gpt-6.1-sol', model: 'gpt-6.1-sol', displayName: 'GPT-6.1-sol', defaultReasoningEffort: 'high', supportedReasoningEfforts: [{ reasoningEffort: 'high', description: 'High' }] }] };
      if (method === 'config/read') result = { config: { model: 'gpt-6.1-sol', model_reasoning_effort: 'high' } };
      if (method === 'turn/start') { writes.push({ label, params }); state.activity = 'running'; state.turnId = 'synthetic-active'; result = { turn: { id: state.turnId, status: 'inProgress', items: [] } }; }
      json = { result };
     }
     await route.fulfill({ json });
    });
   }
   await context.addInitScript(threadId => localStorage.setItem('codex-web-local.thread-draft.v1.' + threadId, JSON.stringify({ text: '旧版共享草稿', imageUrls: [], fileAttachments: [], skills: [] })), id);
   await a.goto(base + '/#/thread/' + id);
   await a.getByText('已有历史保留，接管不自动发送草稿。', { exact: true }).waitFor();
   assert.equal(resumes.length, 0);
   await a.locator('textarea.thread-composer-input').fill('A 的首条消息');
   const sent = a.waitForResponse(r => r.url().endsWith('/codex-api/rpc') && r.request().postDataJSON()?.method === 'turn/start');
   await a.locator('textarea.thread-composer-input').press('Enter');
   await sent;
   await a.waitForFunction(() => !document.querySelector('textarea.thread-composer-input')?.value);
   assert.equal(writes.length, 1);
   await a.reload();
   await a.getByText('已有历史保留，接管不自动发送草稿。', { exact: true }).waitFor();
   assert.equal(await a.locator('textarea.thread-composer-input').inputValue(), '', 'cleared drafts must not reappear from legacy storage');
   await a.locator('textarea.thread-composer-input').fill('A 的独立草稿');
   await b.goto(base + '/#/thread/' + id);
   await b.getByRole('button', { name: '接管此对话', exact: true }).waitFor();
   await b.locator('textarea.thread-composer-input').fill('B 的独立草稿');
   assert.equal(await b.locator('.thread-composer-submit').isDisabled(), true);
   await b.getByRole('button', { name: '接管此对话', exact: true }).click();
   await b.getByText('本网页控制 · 任务运行中', { exact: true }).waitFor();
   await a.getByText('其他网页 B控制 · 当前只读 · 任务运行中', { exact: true }).waitFor();
   assert.equal(writes.length, 1, 'takeover must not send either draft');
   assert.equal(await a.locator('textarea.thread-composer-input').inputValue(), 'A 的独立草稿');
   assert.equal(await b.locator('textarea.thread-composer-input').inputValue(), 'B 的独立草稿');
   assert.equal(await a.locator('.thread-composer-submit').isDisabled(), true);
   assert.equal(await b.locator('.thread-composer-submit').isDisabled(), false);
   assert.equal(await b.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
   await b.getByText('交接说明', { exact: true }).click();
   await b.getByRole('button', { name: '释放桌面会话（暂不可用）', exact: true }).waitFor();
   assert.equal(await b.getByRole('button', { name: '释放桌面会话（暂不可用）', exact: true }).isDisabled(), true);
   if (screenshots) { fs.mkdirSync(screenshots, { recursive: true }); await b.waitForTimeout(2300); await b.screenshot({ path: path.join(screenshots, `${theme}-${viewport.width}-control.png`), fullPage: true }); }
   await b.getByRole('button', { name: '停止任务并接管', exact: true }).click();
   await b.getByText('任务已确认停止。草稿尚未发送。', { exact: true }).waitFor();
   assert.equal(writes.length, 1);
   await b.getByRole('button', { name: '退出控制', exact: true }).click();
   await b.getByText('尚未接管 · 可查看历史', { exact: true }).waitFor();
   assert.equal(writes.length, 1);
   assert.deepEqual(errors, []);
   await context.close(); scenarios++;
  }
  console.log(JSON.stringify({ passed: true, scenarios, viewports: ['375x812', '768x1024'], themes: ['light', 'dark'], realModelRequests: 0, checks: ['browse without resume', 'two tab takeover', 'active task continues', 'observer submit disabled', 'per-tab drafts retained', 'stop explicit confirmation', 'release without send', 'desktop limitation visible', 'no overflow or runtime errors'] }));
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
