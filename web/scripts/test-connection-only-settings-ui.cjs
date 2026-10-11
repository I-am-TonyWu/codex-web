'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.SETTINGS_TEST_URL || 'http://127.0.0.1:4195';
const screenshots = process.env.SETTINGS_SCREENSHOT_DIR;
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  let scenarios = 0;
  try {
    for (const colorScheme of process.env.SETTINGS_TEST_THEME ? [process.env.SETTINGS_TEST_THEME] : ['light','dark']) for (const width of process.env.SETTINGS_TEST_WIDTHS ? process.env.SETTINGS_TEST_WIDTHS.split(',').map(Number) : [375,768,1440]) {
      const page = await browser.newPage({viewport:{width,height:900},colorScheme});
      page.setDefaultTimeout(10000);
      const errors=[], calls=[], writes=[], forbidden=[];
      let provider='codex', failProvider=false;
      const original='11111111-1111-4111-8111-111111111111';
      const control={threadId:original,epoch:'fixture',version:0,owner:null,proof:null,activity:'idle',executionSource:'web'};
      const thread={id:original,name:'设置验证',cwd:'C:/Fixture',createdAt:1760000000,updatedAt:1760000100,status:{type:'notLoaded'},turns:[]};
      page.on('pageerror',error=>errors.push(error.message));
      await page.addInitScript(theme=>{
        localStorage.setItem('codex-web-local.ui-language.v1','zh-CN');
        localStorage.setItem('codex-ui-theme',theme);
        if(localStorage.getItem('codex-web-local.send-with-enter.v1')===null)localStorage.setItem('codex-web-local.send-with-enter.v1','1');
      },colorScheme);
      await page.route('**/codex-api/**',async route=>{
        const pathname=new URL(route.request().url()).pathname;
        let json={data:[],result:{},titles:{},pins:[],prompts:[]};
        if (/\/accounts(?:\/|$)|\/telegram(?:\/|$)/.test(pathname)) forbidden.push(pathname);
        if(pathname.startsWith('/codex-api/control/')) {
          if(pathname.endsWith('/register')) json={data:{id:'fixture',key:'fixture-key'}};
          else {
            if(pathname.endsWith('/claim')) {control.owner={id:'fixture',label:'网页'};control.version++;control.proof={epoch:'fixture',version:control.version,token:'fixture-token'};}
            json={data:control};
          }
        }
        if(pathname==='/codex-api/thread-titles')json={titles:{[original]:thread.name}};
        if(pathname==='/codex-api/workspace-roots-state')json={data:{order:[],labels:{},active:[],localProjects:[]}};
        if(pathname==='/codex-api/free-mode/status')json={enabled:provider!=='codex',hasCodexAuth:true,provider:provider==='codex'?undefined:provider,models:['fixture-model'],customKey:false,keyCount:0};
        if(pathname==='/codex-api/free-mode/custom-provider') {
          if(failProvider)return route.fulfill({status:409,json:{error:'provider_busy',message:'有任务正在运行，请结束任务后再切换提供方。'}});
          provider=route.request().postDataJSON().provider;json={ok:true};
        }
        if(pathname==='/codex-api/free-mode'){provider='codex';json={ok:true,enabled:false};}
        if(pathname==='/codex-api/provider-models')json={data:['fixture-model'],exclusive:provider!=='codex'};
        if(pathname==='/codex-api/rpc') {
          const {method,params}=route.request().postDataJSON(); calls.push(method);
          if(method.startsWith('account/')&&method!=='account/read'&&method!=='account/rateLimits/read')forbidden.push(method);
          let result={};
          if(method==='thread/list')result={data:[thread],nextCursor:null};
          if(method==='thread/read'||method==='thread/resume')result={thread};
          if(method==='model/list')result={data:[{id:'fixture-model',model:'fixture-model',displayName:'Fixture model',defaultReasoningEffort:'high',supportedReasoningEfforts:[{reasoningEffort:'high',description:'High'}]}]};
          if(method==='config/read')result={config:{model:'fixture-model',model_provider:provider==='codex'?'openai':provider.replaceAll('-','_'),model_reasoning_effort:'high'}};
          if(method==='account/rateLimits/read')result={rateLimits:{limitId:'codex',limitName:'Codex',planType:'plus',primary:{usedPercent:12,windowDurationMins:300,resetsAt:Math.floor(Date.now()/1000)+3600},secondary:{usedPercent:21,windowDurationMins:10080,resetsAt:Math.floor(Date.now()/1000)+86400},credits:null}};
          if(method==='turn/start'){writes.push(params);result={turn:{id:'fixture-turn',status:'completed',items:[]}};}
          json={result,...(method==='thread/resume'?{control}:{})};
        }
        await route.fulfill({json});
      });
      await page.goto(base+'/#/thread/'+original);
      await page.locator('textarea.thread-composer-input').waitFor();
      if(await page.locator('.sidebar-settings-button').count()===0)await page.locator('.sidebar-thread-controls-header-host .sidebar-thread-controls-button').first().click();
      const openSettings=async()=>{await page.waitForTimeout(350);if(!(await page.locator('.sidebar-settings-panel').isVisible()))await page.locator('.sidebar-settings-button').click();await page.waitForTimeout(250);};
      await openSettings();
      await page.locator('.sidebar-settings-rate-limits .rate-limit-card').waitFor();
      assert.equal(await page.locator('.sidebar-settings-account-section,.codex-login-modal').count(),0);
      assert.equal(await page.locator('.sidebar-settings-panel').getByText('Telegram',{exact:true}).count(),0);
      assert.equal(await page.locator('.sidebar-settings-panel').evaluate(el=>el.firstElementChild.classList.contains('sidebar-settings-rate-limits')),true);
      await page.getByRole('button',{name:'需要 Ctrl + Enter 才发送',exact:true}).click();
      if(screenshots){fs.mkdirSync(screenshots,{recursive:true});await page.screenshot({path:path.join(screenshots,`${colorScheme}-${width}-settings.png`)});}
      const selectProvider=async label=>{await openSettings();const dropdown=page.locator('.sidebar-settings-provider-dropdown').last();await dropdown.locator('.composer-dropdown-trigger').click();await dropdown.getByRole('button',{name:label,exact:true}).click();};
      await selectProvider('OpenCode Zen');
      await page.waitForTimeout(400);
      assert.equal(await page.locator('.sidebar-settings-provider-dropdown').last().locator('.composer-dropdown-value').innerText(),'OpenCode Zen');
      await selectProvider('Codex'); await page.waitForTimeout(450);
      assert.equal(await page.locator('.sidebar-settings-provider-dropdown').last().locator('.composer-dropdown-value').innerText(),'Codex');
      failProvider=true; await selectProvider('OpenCode Zen');
      await page.locator('.sidebar-settings-error').filter({hasText:'有任务正在运行'}).waitFor();
      assert.equal(await page.locator('.sidebar-settings-provider-dropdown').last().locator('.composer-dropdown-value').innerText(),'Codex');
      await page.locator('.sidebar-settings-button').click();
      if(width<768)await page.locator('.mobile-drawer-backdrop').click({position:{x:width-8,y:40}});
      const input=page.locator('textarea.thread-composer-input');
      await input.fill('键盘测试，仅发送给本地测试夹具');
      await input.press('Enter'); await input.press('Meta+Enter'); await input.press('Shift+Enter');
      assert.equal(writes.length,0,'Enter, Command+Enter and Shift+Enter must not send when Ctrl is required');
      const sent=page.waitForResponse(r=>r.url().endsWith('/codex-api/rpc')&&r.request().postDataJSON()?.method==='turn/start');
      await input.press('Control+Enter'); await sent;
      assert.equal(writes.length,1);
      assert.deepEqual(forbidden,[]);assert.deepEqual(errors,[]);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.reload(); await page.locator('textarea.thread-composer-input').waitFor();
      if(await page.locator('.sidebar-settings-button').count()===0)await page.locator('.sidebar-thread-controls-header-host .sidebar-thread-controls-button').first().click();
      await openSettings();
      assert.equal(await page.getByRole('button',{name:'需要 Ctrl + Enter 才发送',exact:true}).locator('.sidebar-settings-toggle.is-on').count(),1,'shortcut preference survives reload');
      assert.deepEqual(forbidden,[]);assert.deepEqual(errors,[]);
      await page.close();scenarios+=7;
      console.log(`Passed ${colorScheme} ${width}`);
    }
    console.log(JSON.stringify({passed:true,scenarios,realModelRequests:0,checks:['no accounts or Telegram','quota at top','Ctrl shortcut and persistence','provider roundtrip','busy rollback','no auth mutation calls','mobile layout']}));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
