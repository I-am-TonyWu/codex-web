'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.WRITER_TEST_URL || 'http://127.0.0.1:4195';
const screenshotDir = process.env.WRITER_SCREENSHOT_DIR;
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  let scenarios = 0;
  try {
    for (const colorScheme of ['light', 'dark']) for (const viewport of [
      { width: 375, height: 812 }, { width: 768, height: 1024 },
    ]) for (const recovery of ['check', 'manual-send']) {
      const page = await browser.newPage({ viewport, colorScheme });
      const errors = [], calls = [], writes = [], forks = [];
      let writerLocked = true;
      const controlState = { threadId: '11111111-1111-4111-8111-111111111111', epoch: 'fixture', version: 0, owner: null, proof: null, activity: 'idle', turnId: null, transferring: false, desktopReleaseAvailable: false };
      page.on('pageerror', error => errors.push(error.message));
      const original = '11111111-1111-4111-8111-111111111111';
      const thread = { id: original, name: '历史对话恢复测试', preview: '已有历史', cwd: 'C:/Fixture',
        createdAt: 1760000000, updatedAt: 1760000100, source: 'appServer', status: { type: 'notLoaded' },
        turns: [{ id: 'completed-history', status: 'completed', items: [
          { id: 'history-message', type: 'agentMessage', text: '这里是原对话已有的历史内容。' },
        ] }] };
      await page.addInitScript(scheme => {
        localStorage.setItem('codex-web-local.ui-language.v1', 'zh-CN');
        localStorage.setItem('codex-ui-theme', scheme);
      }, colorScheme);
      await page.route('**/codex-api/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        let json = { data: [], result: {}, accounts: [], titles: {}, pins: [], prompts: [] };
        if (pathname.startsWith('/codex-api/control/')) {
          if (pathname.endsWith('/register')) json = { data: { id: 'fixture', key: 'fixture-key' } };
          else {
            if (pathname.endsWith('/claim')) { controlState.version++; controlState.owner = { id: 'fixture', label: '手机网页' }; controlState.proof = { epoch: 'fixture', version: controlState.version, token: 'fixture-token' }; }
            if (pathname.endsWith('/recheck')) { controlState.activity = writerLocked ? 'external' : 'idle'; controlState.revision = (controlState.revision || 0) + 1; }
            if (pathname.endsWith('/release')) { controlState.owner = null; controlState.proof = null; controlState.version++; }
            json = { data: controlState };
          }
        }
        if (pathname === '/codex-api/thread-titles') json = { titles: { [original]: thread.name } };
        if (pathname === '/codex-api/workspace-roots-state') json = { data: { order: [], labels: {}, active: [], localProjects: [] } };
        if (pathname === '/codex-api/rpc') {
          const { method, params } = route.request().postDataJSON(); calls.push({ method, params });
          let result = {};
          if (method === 'thread/list') result = { data: [thread], nextCursor: null };
          if (method === 'thread/resume') { controlState.activity = writerLocked ? 'external' : 'idle'; controlState.revision = (controlState.revision || 0) + 1; }
          if (method === 'thread/read' || method === 'thread/resume') result = { thread,
            ...(method === 'thread/resume' && writerLocked ? { webReadOnlyReason: 'thread_writer_conflict' } : {}) };
          if (method === 'model/list') result = { data: [{ id: 'gpt-6.1-sol', model: 'gpt-6.1-sol', displayName: 'GPT-6.1-sol',
            defaultReasoningEffort: 'high', supportedReasoningEfforts: [{ reasoningEffort: 'high', description: 'High' }] }] };
          if (method === 'config/read') result = { config: { model: 'gpt-6.1-sol', model_reasoning_effort: 'high' } };
          if (method === 'thread/fork') forks.push(params);
          if (method === 'turn/start') { writes.push(params); result = { turn: { id: 'synthetic-turn', status: 'inProgress', items: [] } }; }
          json = { result, control: method === 'thread/resume' ? controlState : undefined };
        }
        await route.fulfill({ json });
      });
      await page.goto(base + '/#/thread/' + original);
      await page.getByText('这里是原对话已有的历史内容。', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), colorScheme === 'dark');
      assert.equal(calls.filter(call => call.method === 'thread/resume').length, 0, 'browsing must not acquire a writer');
      const input = page.locator('textarea.thread-composer-input');
      const draft = '保留原对话，继续制作汇报页';
      await input.fill(draft); await input.press('Enter');
      const retry = page.getByRole('button', { name: '重试原对话', exact: true });
      await retry.waitFor();
      assert.equal(writes.length, 0);
      assert.equal(await page.locator('.thread-composer-submit').isDisabled(), false, 'a past native conflict must permit a manual retry');
      await retry.click();
      await retry.waitFor({ state: 'visible' });
      await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(b => b.textContent.includes('正在重新连接')));
      assert.equal(writes.length, 0, 'failed reconnect never starts a turn');
      assert.equal(forks.length, 0, 'retry original never forks');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (screenshotDir) {
        fs.mkdirSync(screenshotDir, { recursive: true });
        await page.waitForTimeout(2200);
        await page.screenshot({ path: path.join(screenshotDir, `${colorScheme}-${viewport.width}-${recovery}-conflict.png`), fullPage: true });
      }
      writerLocked = false;
      if (recovery === 'check') {
        await page.getByRole('button', { name: '重新检查写入状态', exact: true }).click();
        await page.waitForFunction(text => document.querySelector('textarea.thread-composer-input')?.value === text, draft);
        await retry.waitFor({ state: 'hidden' });
        assert.equal(writes.length, 0, 'explicit probe never sends the draft');
        assert.equal(await page.locator('.thread-composer-submit').isDisabled(), false, 'successful probe clears stale readonly immediately');
      }
      assert.equal(new URL(page.url()).hash, '#/thread/' + original);
      assert.equal(forks.length, 0);
      if (screenshotDir) {
        await page.waitForTimeout(2200);
        await page.screenshot({ path: path.join(screenshotDir, `${colorScheme}-${viewport.width}-${recovery}-recovered.png`), fullPage: true });
      }
      const sent = page.waitForResponse(r => r.url().endsWith('/codex-api/rpc') && r.request().postDataJSON()?.method === 'turn/start');
      await input.press('Enter');
      await sent;
      await page.waitForFunction(() => !document.querySelector('textarea.thread-composer-input')?.value);
      assert.equal(writes.length, 1);
      assert.equal(writes[0].threadId, original);
      assert.deepEqual(errors, []);
      await page.close(); scenarios++;
    }
    console.log(JSON.stringify({ passed: true, scenarios, realModelRequests: 0,
      checks: ['reader-only history', 'blocked send', 'blocked retry', 'same original ID', 'restored draft', 'no auto send or fork', 'manual original send'],
      viewports: ['375x812', '768x1024'], themes: ['light', 'dark'] }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
