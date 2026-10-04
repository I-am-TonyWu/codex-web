const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.PROJECT_TEST_URL || 'http://127.0.0.1:4173';
const out = path.resolve(__dirname, '../output/playwright');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
  const errors = [], requests = [], mutations = [];
  const thread = (id, cwd) => ({ id, name: id, preview: id, cwd, createdAt: 1760000000, updatedAt: 1760000100, turns: [], source: 'appServer' });
  let state = { order: ['C:\\Projects\\alpha', 'C:\\Projects\\beta'], labels: {}, active: [], projectOrder: ['beta', 'alpha'],
    localProjects: [{ id: 'alpha', name: '同步测试甲', rootPaths: ['C:\\Projects\\alpha'] }, { id: 'beta', name: '空项目乙', rootPaths: ['C:\\Projects\\beta'] }],
    threadProjectAssignments: { 'moved-history': 'alpha' }, projectlessThreadIds: ['standalone-history'], projectThreadOrders: { alpha: ['moved-history'] } };
  let fail = false, failAssignment = false;
  const histories = [thread('moved-history', 'C:\\Old\\historical-folder'), thread('standalone-history', 'C:\\Projects\\alpha'), thread('root-history', 'c:\\projects\\alpha')];
  await page.addInitScript(() => {
    localStorage.setItem('codex-web-local.sidebar-collapsed.v1', '0');
    localStorage.setItem('codex-web-local.ui-language.v1', 'zh-CN');
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/codex-api/**', async route => {
    const req = route.request(), pathname = new URL(req.url()).pathname;
    if (pathname === '/codex-api/workspace-roots-state') {
      requests.push(Date.now());
      return route.fulfill({ status: fail ? 503 : 200, json: fail ? { error: 'synthetic offline' } : { data: state } });
    }
    if (pathname === '/codex-api/local-project') {
      const mutation = req.postDataJSON(); mutations.push(mutation);
      if (mutation.type === 'rename') state.localProjects.find(project => project.id === mutation.projectId).name = mutation.name;
      if (mutation.type === 'reorder') state.projectOrder = mutation.projectIds;
      if (mutation.type === 'remove') state.localProjects = state.localProjects.filter(project => project.id !== mutation.projectId);
      return route.fulfill({ json: { ok: true } });
    }
    if (pathname === '/codex-api/thread-project') {
      const mutation = req.postDataJSON(); mutations.push(mutation);
      await new Promise(resolve => setTimeout(resolve, 600));
      if (failAssignment) return route.fulfill({ status: 409, json: { error: 'Project changed; refresh and retry' } });
      delete state.threadProjectAssignments[mutation.threadId];
      state.projectlessThreadIds = state.projectlessThreadIds.filter(id => id !== mutation.threadId);
      if (mutation.projectId === null) state.projectlessThreadIds.push(mutation.threadId);
      else state.threadProjectAssignments[mutation.threadId] = mutation.projectId;
      return route.fulfill({ json: { ok: true } });
    }
    if (pathname === '/codex-api/rpc') {
      const { method, params } = req.postDataJSON();
      if (method === 'thread/list') return route.fulfill({ json: { result: { data: histories, nextCursor: null } } });
      if (method === 'thread/read' || method === 'thread/resume') return route.fulfill({ json: { result: { thread: histories.find(row => row.id === params.threadId) || histories[0] } } });
      // A test must never submit model work or change user conversations.
      assert.ok(!['turn/start', 'thread/start', 'thread/archive', 'thread/name/set'].includes(method), method);
    }
    return route.continue();
  });
  await page.goto(base + '/#/', { waitUntil: 'domcontentloaded' });
  const projects = page.locator('.sidebar-root [data-project-name]');
  await page.locator('.sidebar-root [data-project-name="alpha"]').waitFor({ timeout: 30000 });
  assert.deepEqual(await projects.evaluateAll(rows => rows.map(row => row.dataset.projectName)), ['beta', 'alpha']);
  assert.ok(await page.locator('.sidebar-root [data-project-name="alpha"]').innerText().then(text => text.includes('同步测试甲')));
  // The moved task belongs to Alpha even though its execution directory is outside the project.
  const alpha = page.locator('.sidebar-root [data-project-name="alpha"]');
  if (await alpha.getAttribute('data-expanded') !== 'true') await alpha.locator('.project-title').click();
  await alpha.getByText('moved-history', { exact: true }).waitFor();
  await alpha.getByText('root-history', { exact: true }).waitFor();
  assert.equal(await alpha.getByText('standalone-history', { exact: true }).count(), 0);
  await page.locator('.sidebar-root').getByText('standalone-history', { exact: true }).waitFor();
  const baseline = requests.length;
  await page.waitForTimeout(10500);
  const idleRequests = requests.length - baseline;
  assert.ok(idleRequests >= 2 && idleRequests <= 3, 'One project request per five seconds, without duplicates');
  state = { ...state, projectOrder: ['gamma', 'alpha', 'beta'], localProjects: [...state.localProjects.map(project => project.id === 'alpha' ? { ...project, name: '中文项目已改名' } : project), { id: 'gamma', name: '新增空项目丙', rootPaths: ['C:\\Projects\\gamma'] }] };
  await page.locator('.sidebar-root [data-project-name="gamma"]').waitFor({ timeout: 12000 });
  assert.deepEqual(await projects.evaluateAll(rows => rows.map(row => row.dataset.projectName)), ['gamma', 'alpha', 'beta']);
  await alpha.getByText('中文项目已改名', { exact: true }).waitFor();
  state.threadProjectAssignments = { 'moved-history': 'gamma' };
  const gamma = page.locator('.sidebar-root [data-project-name="gamma"]');
  if (await gamma.getAttribute('data-expanded') !== 'true') await gamma.locator('.project-title').click();
  await gamma.getByText('moved-history', { exact: true }).waitFor({ timeout: 12000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.sidebar-root [data-project-name="gamma"]').waitFor();
  assert.deepEqual(await projects.evaluateAll(rows => rows.map(row => row.dataset.projectName)), ['gamma', 'alpha', 'beta']);
  fail = true;
  await page.waitForTimeout(5700);
  assert.equal(await projects.count(), 3, 'Keep sidebar on network failure');
  fail = false;
  state = { ...state, localProjects: state.localProjects.filter(project => project.id !== 'beta'), projectOrder: ['gamma', 'alpha'] };
  await page.locator('.sidebar-root [data-project-name="beta"]').waitFor({ state: 'detached', timeout: 12000 });
  async function openAssignment(id) {
    await page.locator('.sidebar-root').getByText(id, { exact: true }).click({ button: 'right' });
    await page.locator('.thread-menu-panel').getByRole('button', { name: '项目', exact: true }).click();
    await page.getByRole('dialog', { name: '项目', exact: true }).waitFor();
  }
  const dialog = page.getByRole('dialog', { name: '项目', exact: true });
  await openAssignment('standalone-history');
  await dialog.getByRole('button', { name: '新增空项目丙', exact: true }).click();
  assert.equal(await dialog.getByRole('button', { name: '中文项目已改名', exact: true }).isDisabled(), true, 'Lock all options while saving');
  await dialog.waitFor({ state: 'detached' });
  await gamma.getByText('standalone-history', { exact: true }).waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await gamma.getByText('standalone-history', { exact: true }).waitFor();
  await openAssignment('standalone-history');
  await dialog.getByRole('button', { name: '无项目（普通聊天）', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.locator('.sidebar-root').getByText('standalone-history', { exact: true }).waitFor();
  assert.equal(await gamma.getByText('standalone-history', { exact: true }).count(), 0);
  failAssignment = true;
  await openAssignment('standalone-history');
  await dialog.getByRole('button', { name: '中文项目已改名', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(await gamma.getByText('standalone-history', { exact: true }).count(), 0);
  assert.equal(await dialog.getByRole('button', { name: '取消', exact: true }).isEnabled(), true);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  failAssignment = false;
  assert.equal(mutations.filter(row => row.threadId === 'standalone-history').length, 3);
  for (const size of [{ width: 375, height: 812 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(size);
    const expand = page.getByRole('button', { name: '展开侧边栏', exact: true });
    if (await expand.count()) await expand.first().click();
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
      await openAssignment('standalone-history');
      await dialog.getByRole('searchbox').fill('项目丙');
      assert.equal(await dialog.getByRole('button', { name: '中文项目已改名', exact: true }).count(), 0);
      await dialog.getByRole('button', { name: '新增空项目丙', exact: true }).waitFor();
      await page.waitForTimeout(2200);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(out, `thread-project-${size.width}-${dark ? 'dark' : 'light'}-cjs.png`) });
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
    }
  }
  assert.deepEqual(errors, []);
  const result = { url: base + '/#/', passed: true, projectRequestsDuring10500ms: idleRequests, responsive: ['375x812 light/dark', '768x1024 light/dark'], scenarios: ['IDs and moved history', 'empty projects', 'desktop rename/add/reorder', 'membership changes', 'refresh persistence', 'offline preservation', 'desktop removal', 'right-click project picker', 'move ordinary chat and move back', 'save lock', 'failed assignment retry', 'project search'], mutations, errors };
  fs.writeFileSync(path.join(out, 'project-sync-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
