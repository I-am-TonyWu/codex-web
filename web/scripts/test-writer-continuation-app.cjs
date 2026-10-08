'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.WRITER_TEST_URL || 'http://127.0.0.1:4173';
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    const errors = [], writes = [], forks = [], assignments = [], calls = [];
    page.on('pageerror', error => errors.push(error.message));
    const original = '11111111-1111-4111-8111-111111111111', continuation = '22222222-2222-4222-8222-222222222222';
    const histories = [{ id: original, name: 'Web修订', preview: '已有历史', cwd: 'C:/Fixture',
      createdAt: 1760000000, updatedAt: 1760000100, source: 'appServer',
      turns: [{ id: 'completed-history', status: 'completed', items: [{ id: 'history-message', type: 'agentMessage', text: '这里是原对话已有的历史内容。' }] }] }];
    const workspace = { order: ['C:/Fixture'], labels: {}, active: [], projectOrder: ['alpha'],
      localProjects: [{ id: 'alpha', name: '测试项目', rootPaths: ['C:/Fixture'] }],
      threadProjectAssignments: { [original]: 'alpha' }, projectlessThreadIds: [] };
    await page.addInitScript(() => localStorage.setItem('codex-web-local.ui-language.v1', 'zh-CN'));
    await page.route('**/codex-api/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      let json = { data: [], result: {}, accounts: [], titles: {}, pins: [], prompts: [] };
      if (pathname === '/codex-api/workspace-roots-state') json = { data: workspace };
      if (pathname === '/codex-api/thread-titles') json = { titles: { [original]: 'Web修订' } };
      if (pathname === '/codex-api/thread-project') {
        const body = route.request().postDataJSON(); assignments.push(body);
        workspace.threadProjectAssignments[body.threadId] = body.projectId;
        json = { ok: true };
      }
      if (pathname === '/codex-api/rpc') {
        const { method, params } = route.request().postDataJSON();
        calls.push({ method, threadId: params?.threadId });
        let result = {};
        if (method === 'thread/list') result = { data: histories, nextCursor: null };
        if (method === 'thread/resume' || method === 'thread/read') result = { thread: histories.find(row => row.id === params.threadId),
          ...(method === 'thread/resume' && params.threadId === original ? { webReadOnlyReason: 'thread_writer_conflict' } : {}) };
        if (method === 'model/list') result = { data: [{ id: 'gpt-6.1-sol', model: 'gpt-6.1-sol', displayName: 'GPT-6.1-sol',
          defaultReasoningEffort: 'high', supportedReasoningEfforts: [{ reasoningEffort: 'high', description: 'High' }] }] };
        if (method === 'config/read') result = { config: { model: 'gpt-6.1-sol', model_reasoning_effort: 'high' } };
        if (method === 'thread/fork') {
          forks.push(params);
          await new Promise(resolve => setTimeout(resolve, 500));
          histories.push({ ...histories[0], id: continuation });
          result = { thread: histories[1], model: 'gpt-6.1-sol' };
        }
        if (method === 'thread/name/set') {
          histories.find(row => row.id === params.threadId).name = params.name;
        }
        if (method === 'turn/start') { writes.push(params); result = { turn: { id: 'synthetic-turn', status: 'inProgress', items: [] } }; }
        json = { result };
      }
      await route.fulfill({ json });
    });
    await page.goto(base + '/#/thread/' + original);
    await page.getByText('这里是原对话已有的历史内容。', { exact: true }).waitFor();
    const input = page.locator('.content-thread').locator('..').locator('textarea.thread-composer-input');
    await input.fill('这是一条未发送的继续工作消息');
    await input.press('Enter');
    const button = page.getByRole('button', { name: '在网页接续（保留原对话）', exact: true });
    await button.waitFor();
    assert.equal(writes.length, 0, 'read-only resume must block the model turn');
    await button.click();
    await page.waitForURL('**/#/thread/' + continuation);
    await assert.doesNotReject(() => page.waitForFunction(() => document.querySelector('textarea.thread-composer-input')?.value === '这是一条未发送的继续工作消息'));
    assert.equal(forks.length, 1);
    assert.deepEqual(assignments, [{ threadId: continuation, projectId: 'alpha' }]);
    assert.equal(histories[1].name, 'Web修订 · 网页接续');
    assert.equal(histories[0].name, 'Web修订');
    assert.equal(writes.length, 0, 'draft must not auto-send');
    await page.getByText('这里是原对话已有的历史内容。', { exact: true }).waitFor();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('textarea.thread-composer-input').inputValue(), '这是一条未发送的继续工作消息');
    await Promise.all([
      page.waitForRequest(request => new URL(request.url()).pathname === '/codex-api/rpc' && request.postDataJSON()?.method === 'turn/start', { timeout: 7000 })
        .catch(async error => { console.error(JSON.stringify({ calls: calls.slice(-15), visible: (await page.locator('body').innerText()).slice(-1500), errors })); throw error; }),
      page.locator('textarea.thread-composer-input').press('Enter'),
    ]);
    await page.waitForFunction(() => !document.querySelector('textarea.thread-composer-input')?.value);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].threadId, continuation);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, modelRequests: 0, syntheticWrites: writes.length,
      scenarios: ['read-only history', 'blocked send', 'explicit fork', 'restored draft', 'original unchanged', 'project preserved', 'new thread send'] }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
