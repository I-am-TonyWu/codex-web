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
   let failedChecks = 0;
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
      if (pathname.endsWith('/recheck') && failedChecks > 0) { failedChecks--; await route.fulfill({ json: { error: { code: 'rpc_error', message: 'Fixture writer check failed' } } }); return; }
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
   assert.equal(writes.length, 0, 'plain Enter must not send');
   await a.locator('textarea.thread-composer-input').press('Control+Enter');
   await sent;
   await a.waitForFunction(() => !document.querySelector('textarea.thread-composer-input')?.value);
   assert.equal(writes.length, 1);
   await a.reload();
   await a.getByText('已有历史保留，接管不自动发送草稿。', { exact: true }).waitFor();
   assert.equal(await a.locator('textarea.thread-composer-input').inputValue(), '', 'cleared drafts must not reappear from legacy storage');
   await a.locator('textarea.thread-composer-input').fill('A 的独立草稿');
   await b.goto(base + '/#/thread/' + id);
   await b.getByText('已有历史保留，接管不自动发送草稿。', { exact: true }).waitFor();
   await b.locator('.control-toggle').click();
   await b.getByRole('button', { name: '接管并检查写入', exact: true }).waitFor();
   await b.locator('textarea.thread-composer-input').fill('B 的独立草稿');
   assert.equal(await b.locator('.thread-composer-submit').isDisabled(), true);
   if (!await b.getByRole('button', { name: '接管并检查写入', exact: true }).isVisible()) await b.locator('.control-toggle').click();
   await b.getByRole('button', { name: '接管并检查写入', exact: true }).click();
   await b.getByText('本网页控制', { exact: true }).waitFor();
   assert.equal(state.activity, 'running', 'takeover keeps the current task running');
   await a.bringToFront();
   await a.getByText('其他网页 B控制 · 只读', { exact: true }).waitFor();
   assert.equal(writes.length, 1, 'takeover must not send either draft');
   assert.equal(await a.locator('textarea.thread-composer-input').inputValue(), 'A 的独立草稿');
   assert.equal(await b.locator('textarea.thread-composer-input').inputValue(), 'B 的独立草稿');
   assert.equal(await a.locator('.thread-composer-submit').isDisabled(), true);
   assert.equal(await b.locator('.thread-composer-submit').isDisabled(), false);
   assert.equal(await b.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
   await b.bringToFront();
   await b.getByText('交接说明', { exact: true }).click();
   await b.getByText('返回桌面初始页或关闭聊天界面，不保证后台释放写入占用。', { exact: false }).waitFor();
   if (screenshots) { fs.mkdirSync(screenshots, { recursive: true }); await b.waitForTimeout(2300); await b.screenshot({ path: path.join(screenshots, `${theme}-${viewport.width}-control.png`), fullPage: true }); }
   await b.getByRole('button', { name: '停止任务并接管', exact: true }).click();
   await b.getByText('原对话写入检查通过。请手动发送草稿，不会自动重发。', { exact: true }).waitFor();
   assert.equal(writes.length, 1);
   await b.getByRole('button', { name: '退出控制', exact: true }).click();
   await b.getByText('网页控制未取得', { exact: true }).waitFor();
   assert.equal(state.activity, 'idle');
   assert.equal(writes.length, 1);
   await b.evaluate(threadId => sessionStorage.setItem('codex-web.pending-sends.v1', JSON.stringify({ [threadId]: { id: 'uncertain-request', fingerprint: 'fixture' } })), id);
   await b.route('**/codex-api/control/receipt?*', route => route.fulfill({ json: { data: { state: 'pending' } } }));
   await b.reload();
   await b.getByRole('button', { name: '发送待确认 · 核对', exact: true }).click();
   await b.getByText('结果仍待确认。请核对最新历史；取得控制权不会清除这条发送记录，也不会自动重发。', { exact: true }).waitFor();
   assert.equal(await b.getByRole('button', { name: '已核对历史，允许下一次发送', exact: true }).isVisible(), true, 'recovery must be outside collapsed help');
   assert.equal(await b.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'pending recovery must fit a mobile viewport');
   if (screenshots) await b.screenshot({ path: path.join(screenshots, `${theme}-${viewport.width}-pending.png`), fullPage: true });
   await b.getByRole('button', { name: '重新连接并检查写入', exact: true }).click();
   await b.getByText('写入检查通过，但上一条发送仍待核对。请先核对发送结果。', { exact: true }).waitFor();
   assert.equal(writes.length, 1, 'reconnection must not resend an uncertain request');
   failedChecks = 1;
   await b.getByRole('button', { name: '重新连接并检查写入', exact: true }).click();
   await b.getByText('本次写入检查未通过。请查看对话中的错误，草稿尚未发送。', { exact: true }).waitFor();
   assert.equal(await b.getByText('写入检查通过，但上一条发送仍待核对。请先核对发送结果。', { exact: true }).count(), 0, 'cached idle state cannot claim a failed check passed');
   assert.equal(writes.length, 1);
   await b.getByRole('button', { name: '已核对历史，允许下一次发送', exact: true }).click();
   await b.getByText('已清除待确认标记，没有自动发送消息。', { exact: true }).waitFor();
   assert.equal(await b.getByRole('button', { name: '发送待确认 · 核对', exact: true }).count(), 0);
   assert.equal(writes.length, 1, 'manual acknowledgment must not send');
   assert.deepEqual(errors, []);
   await context.close(); scenarios++;
  }
  console.log(JSON.stringify({ passed: true, scenarios, viewports: ['375x812', '768x1024'], themes: ['light', 'dark'], realModelRequests: 0, checks: ['browse without resume', 'two tab takeover', 'active task continues', 'observer submit disabled', 'per-tab drafts retained', 'stop explicit confirmation', 'release without send', 'desktop limitation visible', 'pending receipt visible', 'reconnect and acknowledge without resend', 'no overflow or runtime errors'] }));
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
