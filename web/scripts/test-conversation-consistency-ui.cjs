'use strict';
const { chromium, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const base = process.env.CONSISTENCY_TEST_URL || 'http://127.0.0.1:4198/tests/conversation-consistency/fixture.html';
const desktopId = '11111111-1111-4111-8111-111111111111';
const webId = '22222222-2222-4222-8222-222222222222';
(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  let cases = 0;
  try {
    for(const theme of ['light','dark']) for(const width of [375,768,1440]) {
      const context = await browser.newContext({viewport:{width,height:900},colorScheme:theme,...(width===375?{isMobile:true,hasTouch:true}:{})});
      const page = await context.newPage();
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`${base}?state=${theme}#/thread/${desktopId}`);
      const user = page.locator('.conversation-item[data-role="user"]');
      await expect(user).toContainText('请根据这两张界面截图');
      const text = await user.innerText();
      assert.ok(!/Files mentioned|My request|Image attachment|C:\/Fixture/.test(text),text);
      await expect(user.locator('img')).toHaveCount(2);
      await expect(user.locator('.message-file-attachment')).toHaveCount(0);
      await page.waitForFunction(()=>[...document.querySelectorAll('.conversation-item[data-role="user"] img')].every(img=>img.complete&&img.naturalWidth>0));
      await user.locator('img').first().click();
      await expect(page.locator('.image-modal-backdrop')).toBeVisible();
      await page.getByRole('button',{name:'关闭图片预览',exact:true}).click();
      await expect(page.locator('.image-modal-backdrop')).toHaveCount(0);
      const title = page.locator('.content-title');
      const menuButton = page.locator('.content-header-thread-menu');
      const styles = await title.evaluate(el=>({size:parseFloat(getComputedStyle(el).fontSize),weight:parseFloat(getComputedStyle(el).fontWeight),height:document.querySelector('.content-header').getBoundingClientRect().height,root:getComputedStyle(document.documentElement).fontSize,rootPadding:getComputedStyle(document.documentElement).padding}));
      assert.ok(styles.size >=16&&styles.weight>=700&&styles.height<=50,JSON.stringify(styles));
      assert.equal(styles.root,'16px');assert.equal(styles.rootPadding,'0px');
      if(width>375){ await page.mouse.move(10,890);await expect.poll(()=>menuButton.evaluate(el=>getComputedStyle(el).opacity)).toBe('0');await title.hover();await expect.poll(()=>menuButton.evaluate(el=>getComputedStyle(el).opacity)).toBe('1'); }
      else assert.equal(await menuButton.evaluate(el=>getComputedStyle(el).opacity),'1');
      await menuButton.press('Enter');
      const menu=page.locator('.thread-menu-panel-fixed');
      await expect(menu).toBeVisible();
      const headerOptions=await menu.locator('button').allTextContents();
      for(const label of ['浏览文件','导出项目','复制路径','复制对话','创建对话分叉','固定对话','重命名对话','归档对话']) assert.ok(headerOptions.some(text=>text.trim()===label),label);
      await menu.getByRole('button',{name:'重命名对话',exact:true}).click();
      await expect(page.getByRole('dialog',{name:'对话标题',exact:true})).toBeVisible();
      await expect(page.locator('.rename-thread-input')).toHaveValue(await title.innerText());
      await page.getByRole('button',{name:'取消',exact:true}).click();
      await menuButton.press('Enter');
      await menu.getByRole('button',{name:'归档对话',exact:true}).click();
      await expect(page.locator('.rename-thread-panel')).toContainText('将归档对话');
      await expect(page.locator('.rename-thread-panel')).toContainText(await title.innerText());
      await expect(page.locator('.rename-thread-panel')).not.toContainText('&quot;');
      await page.getByRole('button',{name:'取消',exact:true}).click();
      await menuButton.press('Enter');await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);
      await menuButton.click();await page.locator('textarea.thread-composer-input').click();await expect(menu).toHaveCount(0);
      const openSidebar=async()=>{if(!await page.locator('.sidebar-settings-button').isVisible())await page.locator('.sidebar-thread-controls-header-host .sidebar-thread-controls-button').first().click();await expect(page.locator('.sidebar-settings-button')).toBeVisible();};
      await openSidebar();
      await page.getByRole('button',{name:'网页显示优化 · 图片历史与标题栏',exact:true}).hover();
      const selectedRow=page.locator('.thread-row').filter({has:page.getByRole('button',{name:'网页显示优化 · 图片历史与标题栏',exact:true})});
      await selectedRow.locator('.thread-menu-trigger').click();await expect(menu).toBeVisible();
      assert.deepEqual(await menu.locator('button').allTextContents(),headerOptions,'header and sidebar share options');
      await page.locator('.sidebar-settings-button').click();await expect(menu).toHaveCount(0);
      await expect(page.locator('.sidebar-font-size-row')).toBeVisible();
      for(const scale of [110,125,150]){await page.getByRole('button',{name:'增大字号',exact:true}).click();await expect(page.locator('.sidebar-font-size-reset')).toHaveText(scale+'%');assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).fontSize),16*scale/100+'px');assert.equal(await page.locator('.sidebar-font-size-row').evaluate(el=>el.scrollWidth>el.clientWidth),false);}
      await expect(page.getByRole('button',{name:'增大字号',exact:true})).toBeDisabled();
      await page.reload();await expect(user).toContainText('请根据这两张界面截图');assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).fontSize),'24px');
      await openSidebar();await page.locator('.sidebar-settings-button').click();await expect(page.locator('.sidebar-font-size-reset')).toHaveText('150%');
      await page.getByRole('button',{name:'恢复标准字号',exact:true}).click();await expect(page.locator('.sidebar-font-size-reset')).toHaveText('100%');
      await expect(page.getByRole('button',{name:'缩小字号',exact:true})).toBeDisabled();
      await page.locator('.sidebar-settings-button').click();
      if(width===375) await page.locator('.mobile-drawer-backdrop').click({position:{x:width-8,y:40}});
      else await page.locator('.sidebar-thread-controls-host .sidebar-thread-controls-button').first().click();
      await menuButton.press('Enter');await expect(menu).toBeVisible();await page.keyboard.press('Escape');
      await page.goto(`${base}?state=${theme}#/thread/${webId}`);await expect(user).toContainText('请根据这两张界面截图');
      assert.equal(await user.innerText(),text,'desktop and web display match');await expect(user.locator('img')).toHaveCount(2);
      assert.ok((await page.locator('.message-fork-button').textContent()).includes('分叉'));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.deepEqual(await page.evaluate(()=>window.fixtureCalls.filter(method=>/^(turn\/|thread\/(fork|rollback|archive))/.test(method))),[]);
      assert.deepEqual(errors,[]);await context.close();cases+=13;console.log(`Passed ${theme} ${width}`);
    }
    console.log(JSON.stringify({passed:true,cases,realModelRequests:0,checks:['desktop/web image parity','image preview','compact bold title','hover/focus/touch menu','shared localized actions','keyboard and outside dismissal','collapsed sidebar menu','font limits and persistence','no overflow or JS errors']}));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
