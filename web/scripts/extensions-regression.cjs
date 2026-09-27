const {chromium}=require('playwright');
const {strict:assert}=require('node:assert');
const fs=require('node:fs'); const path=require('node:path');
const out=path.resolve('output/playwright');fs.mkdirSync(out,{recursive:true});
const url='http://127.0.0.1:4173/output/extension-regression.html';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}); const results=[];
 for(const viewport of [{width:375,height:812},{width:768,height:1024}]) for(const dark of [false,true]) {
  const page=await browser.newPage({viewport}); let added=false,offline=false,requests=0,turn;
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(d=>{document.addEventListener('DOMContentLoaded',()=>document.documentElement.classList.toggle('dark',d));},dark);
  await page.route('**/codex-api/**',async route=>{
   if(route.request().url().includes('/extensions')){
    requests++; if(offline)return route.fulfill({status:503,body:'offline'});
    return route.fulfill({json:{skills:{data:[{skills:[
      {name:'vercel:auth',path:'C:\\skills\\auth\\SKILL.md',description:'Authentication guide. '+('Complete untruncated documentation with examples. '.repeat(12))+'END-OF-DESCRIPTION',enabled:true},
      {name:'disabled-skill',path:'C:/disabled/SKILL.md',description:'disabled',enabled:false},
      ...(added?[{name:'my-added-skill',path:'C:/added/SKILL.md',description:'这是电脑端新添加的自定义技能，支持完整说明。',enabled:true}]:[]),
    ]}]},plugins:{marketplaces:[{name:'openai-curated-remote',plugins:[{id:'vercel@openai-curated-remote',name:'vercel',installed:true,enabled:true,source:{type:'remote'},interface:{displayName:'Vercel',longDescription:'Vercel full plugin description. '+('Plugin tools and skills. '.repeat(10))+'PLUGIN-END'}}]}]},syncing:false,syncError:''}});
   }
   if(route.request().url().includes('/rpc')) {turn=route.request().postDataJSON();return route.fulfill({json:{result:{turn:{id:'test-turn'}}}});}
   return route.fulfill({json:{data:[]}});
  });
  await page.goto(url); await page.getByRole('button',{name:'技能',exact:true}).click();
  await page.getByRole('button',{name:'展开 vercel:auth 的完整说明',exact:true}).click();
  assert(await page.locator('.search-dropdown-full-description').innerText().then(t=>t.includes('身份认证')&&t.includes('END-OF-DESCRIPTION')));
  assert.equal(await page.getByRole('button',{name:/disabled-skill/}).count(),0);
  await page.waitForTimeout(2100);
  const skillShot=path.join(out,`extensions-skills-${viewport.width}-${dark?'dark':'light'}.png`);await page.screenshot({path:skillShot});
  assert(await page.locator('.search-dropdown-full-description').evaluate(el=>getComputedStyle(el).whiteSpace==='pre-wrap'));
  await page.locator('.search-dropdown-option-main').click();
  await page.getByRole('button',{name:'插件',exact:true}).click();
  await page.getByRole('button',{name:'展开 Vercel 的完整说明',exact:true}).click();
  assert((await page.locator('.search-dropdown-full-description').innerText()).includes('PLUGIN-END'));
  await page.waitForTimeout(2100);
  const pluginShot=path.join(out,`extensions-plugins-${viewport.width}-${dark?'dark':'light'}.png`);await page.screenshot({path:pluginShot});
  await page.locator('.search-dropdown-option-main').click();
  await page.locator('textarea').fill('验证选择技能与插件');
  await page.waitForTimeout(300); await page.reload();
  await page.getByRole('button',{name:'插件 Vercel',exact:true}).waitFor();
  await page.getByRole('button',{name:'Open vercel:auth SKILL.md',exact:true}).waitFor();
  await page.locator('.thread-composer-submit').click();
  await page.waitForFunction(()=>!document.querySelector('textarea').value);
  assert(turn.params.input.some(i=>i.type==='mention'&&i.path==='plugin://vercel@openai-curated-remote'));
  assert(turn.params.input.some(i=>i.type==='skill'&&i.path==='C:\\skills\\auth\\SKILL.md'));
  added=true;await page.waitForTimeout(3100);await page.getByRole('button',{name:'技能',exact:true}).click();
  await page.getByRole('button',{name:/my-added-skill.*这是电脑端/}).waitFor();
  await page.locator('.search-dropdown-search').press('Escape');
  offline=true;await page.waitForTimeout(3100);await page.getByRole('button',{name:'技能',exact:true}).click();
  await page.getByText(/同步失败，保留上次列表/).waitFor();
  assert(await page.getByRole('button',{name:/my-added-skill.*这是电脑端/}).isVisible());
  assert.equal(errors.length,0,errors.join('\n'));
  results.push({viewport,dark,requests,passed:true,skillShot,pluginShot});await page.close();
 }
 await browser.close();fs.writeFileSync(path.join(out,'extensions-report.json'),JSON.stringify({url,results},null,2));console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
