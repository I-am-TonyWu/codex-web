const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const readline = require('node:readline');
const assert = require('node:assert/strict');
const home = path.resolve(process.env.SKILLS_NATIVE_HOME || 'output/skills-native-home');
const skillPath = path.join(home, 'skills', 'native-personal-test', 'SKILL.md');
fs.mkdirSync(path.dirname(skillPath), {recursive:true});
fs.writeFileSync(skillPath, '---\nname: native-personal-test\ndescription: Isolated test skill.\n---\nTest only.\n');
const pending = new Map(); let seq=0;
const child = spawn(process.env.RPC_TEST_CODEX || 'codex', ['app-server'], {env:{...process.env,CODEX_HOME:home}, stdio:['pipe','pipe','pipe'],windowsHide:true});
child.stderr.on('data',()=>{});
readline.createInterface({input:child.stdout}).on('line', line => { try { const msg=JSON.parse(line);const p=pending.get(msg.id);if(p){pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result);} }catch{} });
function rpc(method,params){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Timed out: ${method}`))},15000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,method,params})+'\n');});}
async function listed(){const result=await rpc('skills/list',{cwds:[home],forceReload:true});const skill=result.data.flatMap(row=>row.skills).find(skill=>skill.name==='native-personal-test');assert(skill);return skill;}
(async()=>{try{
 await rpc('initialize',{clientInfo:{name:'skills-verification',version:'1.4.7'},capabilities:{experimentalApi:true}});child.stdin.write('{"method":"initialized"}\n');
 const before=await listed();assert.equal(before.enabled,true);
 await rpc('skills/config/write',{path:skillPath,enabled:false});assert.equal((await listed()).enabled,false);
 await rpc('skills/config/write',{path:skillPath,enabled:true});assert.equal((await listed()).enabled,true);
 const result={nativeConfigWrite:true,disabledReadback:true,enabledReadback:true,isolatedHome:true,modelRequests:0};fs.writeFileSync(path.join(home,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{child.kill();}})().catch(error=>{console.error(error);process.exitCode=1;});
