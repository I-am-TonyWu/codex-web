const { chromium } = require('playwright');
const { strict: assert } = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve('output/playwright'); fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const results=[];
 for(const viewport of [{width:375,height:812},{width:768,height:1024}]) for(const dark of [false,true]) {
  const page=await browser.newPage({viewport});
  await page.addInitScript(()=>{
   window.testUploads=[];
   window.XMLHttpRequest=class {
    upload={}; status=200; responseText='';
    open(){} send(form){this.file=form.get('file');window.testUploads.push(this);}
    finish(ok=true){this.status=ok?200:500;this.responseText=JSON.stringify({path:ok?'C:/test/'+this.file.name:null});this.onload();}
    progress(loaded,total){this.upload.onprogress({loaded,total,lengthComputable:true});}
   };
  });
  await page.route('**/codex-api/**',route=>route.fulfill({json:{data:[],result:{data:[]}}}));
  await page.goto('http://127.0.0.1:4173/output/mobile-regression.html');
  await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);
  await page.waitForSelector('.message-file-link');
  assert.equal(await page.evaluate(()=>window.testEffort.value),'medium');
  await page.getByRole('button',{name:'Medium',exact:true}).click();
  assert.deepEqual(await page.locator('.composer-dropdown-option-label').allTextContents(),['Low','Medium','High','Extra high','Max','Ultra']);
  await page.getByRole('button',{name:'Low',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.testEffort.value),'low');
  const link=page.locator('.message-file-link').filter({hasText:'下载测试文件'});
  const data=await link.evaluate(a=>({hrefOk:a.getAttribute('href').includes('100%2523%20%23%20'),titleOk:a.title.endsWith('TestChat 100%23 # 中文.txt'),textOk:a.textContent.trim()==='下载测试文件'}));
  assert.deepEqual(data,{hrefOk:true,titleOk:true,textOk:true});
  await page.locator('textarea').fill('测试上传期间禁止发送');
  await page.locator('input[type=file]').first().setInputFiles({name:'大附件.txt',mimeType:'text/plain',buffer:Buffer.alloc(1024*1024,65)});
  await page.waitForFunction(()=>window.testUploads.length===1);
  assert(await page.locator('.thread-composer-submit').isDisabled());
  await page.evaluate(()=>window.testUploads[0].progress(524288,1048576));
  await page.getByText(/上传中 · 50%/).waitFor();
  await page.waitForTimeout(2200);
  const shot=path.join(out,`mobile-${viewport.width}-${dark?'dark':'light'}.png`);
  await page.screenshot({path:shot});
  await page.evaluate(()=>window.testUploads[0].progress(1048576,1048576));
  assert(await page.locator('.thread-composer-submit').isDisabled());
  await page.evaluate(()=>window.testUploads[0].finish());
  await page.getByText(/✓ 已上传 · 100%/).waitFor();
  assert(await page.locator('.thread-composer-submit').isEnabled());
  await page.locator('input[type=file]').first().setInputFiles({name:'失败附件.txt',mimeType:'text/plain',buffer:Buffer.from('test')});
  await page.waitForFunction(()=>window.testUploads.length===2);
  await page.evaluate(()=>window.testUploads[1].finish(false));
  await page.getByText(/上传失败，请重新选择/).waitFor();
  assert(await page.locator('.thread-composer-submit').isEnabled());
  const list=page.locator('.conversation-list');
  for(let i=0;i<8;i++){await list.evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});await page.waitForTimeout(150);}
  await page.getByText('History 0',{exact:true}).waitFor();
  const geometry=await page.locator('.conversation-item').first().evaluate(el=>({height:el.clientHeight,content:el.scrollHeight,shrink:getComputedStyle(el).flexShrink}));
  assert.equal(geometry.shrink,'0'); assert(geometry.height>=geometry.content-2);
  results.push({viewport,dark,...data,uploadLock:true,uploadProgress:true,uploadFailure:true,historyStart:true,geometry,screenshot:shot});
  if(viewport.width===375&&dark){await list.evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForTimeout(2200);await page.screenshot({path:path.join(out,'testchat-mobile-files-cjs.png')});}
  await page.close();
 }
 await browser.close();fs.writeFileSync(path.join(out,'mobile-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exit(1)});
