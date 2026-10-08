'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.WRITER_TEST_URL || 'http://127.0.0.1:4173';
const out = path.resolve(__dirname, '../output/playwright');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/codex-api/**', route => route.fulfill({ json: { result: {} } }));
    await page.goto(base + '/tests/thread-loading-state/fixtures/writer-conflict.html');
    await page.waitForFunction(() => window.writerTest);
    for (const live of [false, true]) {
      for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }]) {
        await page.setViewportSize(viewport);
        for (const dark of [false, true]) {
          await page.evaluate(({ live, dark }) => {
            document.documentElement.classList.toggle('dark', dark);
            window.writerTest.setError(live);
          }, { live, dark });
          const button = page.getByRole('button', { name: '在网页接续（保留原对话）', exact: true });
          await button.waitFor();
          await button.scrollIntoViewIfNeeded();
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          const rect = await button.boundingBox();
          assert.ok(rect.x >= 0 && rect.x + rect.width <= viewport.width + 1);
          await page.screenshot({ path: path.join(out, `writer-${live ? 'live' : 'persisted'}-${viewport.width}-${dark ? 'dark' : 'light'}.png`) });
          const before = await page.evaluate(() => window.writerTest.events.length);
          await button.click();
          const busy = page.getByRole('button', { name: '正在创建接续对话…', exact: true });
          assert.equal(await busy.isDisabled(), true);
          assert.equal(await page.evaluate(() => window.writerTest.events.length), before + 1);
          assert.equal(await page.evaluate(() => window.writerTest.events.at(-1)), 'desktop-owned');
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, scenarios: 8, modelRequests: 0, screenshots: out }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
