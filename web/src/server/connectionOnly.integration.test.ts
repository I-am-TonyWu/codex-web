import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../commandResolution.js', () => ({ resolveCodexCommand: () => process.execPath, resolveRipgrepCommand: () => null }))
vi.mock('../utils/commandInvocation.js', () => ({ getSpawnInvocation: (_command: string, args: string[]) => ({command:process.execPath,args:[process.env.CONNECTION_TEST_CLI!,...args]}) }))
import { createCodexBridgeMiddleware } from './codexAppServerBridge'

const realFetch = globalThis.fetch
const originalHome = process.env.CODEX_HOME
let home = '', url = '', server: Server, middleware: ReturnType<typeof createCodexBridgeMiddleware>
let originalAuth = '', originalConfig = ''
async function request(route: string, body?: unknown) {
  const response = await realFetch(url + route, {method:body === undefined ? 'GET' : 'POST', headers:{'Content-Type':'application/json', Origin:url}, ...(body===undefined ? {} : {body:JSON.stringify(body)})})
  return {status:response.status, body:await response.json() as any}
}
const fakeCli = String.raw`
const fs=require('node:fs'), path=require('node:path'), rl=require('node:readline');
const home=process.env.CODEX_HOME;
const record=value=>fs.appendFileSync(path.join(home,'rpc-audit.jsonl'),JSON.stringify(value)+'\n');
record({args:process.argv.slice(2)});
rl.createInterface({input:process.stdin}).on('line',line=>{
 const msg=JSON.parse(line); if(!msg.id)return;
 record({method:msg.method,refreshToken:msg.params?.refreshToken,loginType:msg.params?.type});
 let result={};
 if(msg.method==='account/login/start') result={type:msg.params.type};
 if(msg.method==='account/read') result={account:{type:'chatgpt',planType:'plus'}};
 if(msg.method==='thread/loaded/list') result={data:fs.existsSync(path.join(home,'busy'))?['busy-thread']:[]};
 if(msg.method==='thread/read') result={thread:{id:'busy-thread',status:{type:'active'}}};
 if(msg.method==='model/list') result={data:[{id:'host-model',model:'host-model'}]};
 if(msg.method==='account/rateLimits/read') result={rateLimits:{primary:{usedPercent:10,windowDurationMins:300,resetsAt:123},secondary:null,credits:null,planType:'plus'}};
 process.stdout.write(JSON.stringify({id:msg.id,result})+'\n');
});
`

beforeEach(async () => {
  home=await mkdtemp(join(tmpdir(),'codex-web-connection-test-')); process.env.CODEX_HOME=home
  process.env.CONNECTION_TEST_CLI=join(home,'fixture.cjs'); await writeFile(process.env.CONNECTION_TEST_CLI,fakeCli)
  const token=`e30.${Buffer.from(JSON.stringify({exp:Date.now()/1000+3600})).toString('base64url')}.fixture`
  originalAuth=JSON.stringify({auth_mode:'chatgpt',tokens:{access_token:token,account_id:'host',refresh_token:'never-use'}})
  originalConfig='model = "host-model"\n[windows]\nsandbox = "mxc"\n'
  await writeFile(join(home,'auth.json'),originalAuth); await writeFile(join(home,'config.toml'),originalConfig)
  vi.stubGlobal('fetch',vi.fn(async () => new Response(JSON.stringify({data:[{id:'fixture-model'}]}),{status:200})))
  delete (globalThis as any).__codexRemoteSharedBridge__
  middleware=createCodexBridgeMiddleware()
  server=createServer((req,res)=>{void middleware(req,res,()=>{res.statusCode=404;res.end('{}')})})
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  url=`http://127.0.0.1:${(server.address() as any).port}`
})
afterEach(async () => {
  middleware?.dispose(); server?.closeAllConnections()
  await new Promise<void>(resolve=>server?.close(()=>resolve()))
  delete (globalThis as any).__codexRemoteSharedBridge__; delete process.env.CONNECTION_TEST_CLI
  if(originalHome===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=originalHome
  vi.unstubAllGlobals()
  await rm(home,{recursive:true,force:true,maxRetries:10,retryDelay:100})
})

describe('connection-only remote service', () => {
  it('rejects removed account and Telegram endpoints without spawning Codex', async () => {
    for(const route of ['/accounts','/accounts/refresh','/accounts/login/start','/accounts/switch','/accounts/remove','/telegram/configure-bot']) {
      expect((await request('/codex-api'+route,{})).status).toBe(410)
    }
    for(const method of ['account/login/start','account/logout','account/login/cancel','logOutChatGpt']) {
      const result=await request('/codex-api/rpc',{method,params:{}})
      expect(result.status).toBe(403); expect(result.body.error).toBe('account_management_disabled')
    }
    await expect(readFile(join(home,'rpc-audit.jsonl'),'utf8')).rejects.toThrow()
    expect(await readFile(join(home,'auth.json'),'utf8')).toBe(originalAuth)
  })
  it('switches providers and returns to Codex with host auth/config unchanged', async () => {
    await request('/codex-api/rpc',{method:'account/read',params:{refreshToken:true}})
    for(const provider of ['openrouter','opencode-zen','custom']) {
      expect((await request('/codex-api/free-mode/custom-provider',{provider,apiKey:'fixture-key',baseUrl:'http://127.0.0.1:9999/v1'})).status).toBe(200)
      expect((await request('/codex-api/free-mode/status')).body.provider).toBe(provider)
      await request('/codex-api/rpc',{method:'model/list',params:{}})
      expect((await request('/codex-api/free-mode',{enable:false})).status).toBe(200)
      expect((await request('/codex-api/free-mode/status')).body.enabled).toBe(false)
      expect((await request('/codex-api/rpc',{method:'account/rateLimits/read',params:{}})).body.result.rateLimits.primary.usedPercent).toBe(10)
      expect(await readFile(join(home,'auth.json'),'utf8')).toBe(originalAuth)
      expect(await readFile(join(home,'config.toml'),'utf8')).toBe(originalConfig)
    }
    const audit=(await readFile(join(home,'rpc-audit.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line))
    expect(audit.filter(row=>row.args).every(row=>row.args.includes('cli_auth_credentials_store="ephemeral"'))).toBe(true)
    expect(audit.filter(row=>row.method==='account/read').every(row=>row.refreshToken===false)).toBe(true)
    expect(audit.filter(row=>row.method==='account/login/start').every(row=>row.loginType==='chatgptAuthTokens')).toBe(true)
    expect(audit.filter(row=>row.method==='account/login/start')).toHaveLength(4)
    expect(audit.some(row=>row.method==='account/logout')).toBe(false)
  })
  it('does not interrupt an active task when changing provider', async () => {
    await request('/codex-api/rpc',{method:'model/list',params:{}})
    await writeFile(join(home,'busy'),'true')
    const result=await request('/codex-api/free-mode/custom-provider',{provider:'opencode-zen'})
    expect(result.status).toBe(409); expect(result.body.error).toBe('provider_busy')
    await expect(readFile(join(home,'webui-custom-providers.json'),'utf8')).rejects.toThrow()
    expect(await readFile(join(home,'auth.json'),'utf8')).toBe(originalAuth)
    expect((await request('/codex-api/rpc',{method:'model/list',params:{}})).status).toBe(200)
  })
})
