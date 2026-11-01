import { withControlRequests } from './controlTestFixture'
import { afterEach, expect, it, vi } from 'vitest'
import { forkThread, getAvailableModelIds, startThread, uploadFile } from './codexGateway'
import { modelCapabilities } from './modelCapabilities'
afterEach(() => vi.unstubAllGlobals())
it('creates persistent user forks through both gateway entry points', async () => {
  const fetcher=vi.fn(async (_:unknown,init:any)=>{
    expect(JSON.parse(init.body)).toMatchObject({method:'thread/fork',params:{threadId:'original',ephemeral:false,threadSource:'user'}})
    return new Response(JSON.stringify({result:{thread:{id:'fork'}}}))
  })
  vi.stubGlobal('fetch',withControlRequests(fetcher))
  expect((await forkThread('original')).threadId).toBe('fork')
  expect((await forkThread('original','C:/test',undefined)).threadId).toBe('fork')
})
it('refreshes supported efforts from model/list without stale model entries', async () => {
  modelCapabilities.old = { efforts: ['none'], defaultEffort: 'none' }
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({result:{data:[{id:'gpt-6-astra',supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'ultra'}],defaultReasoningEffort:'low'}]}}))))
  await getAvailableModelIds()
  expect(modelCapabilities.old).toBeUndefined()
  expect(modelCapabilities['gpt-6-astra']).toEqual({efforts:['low','ultra'],defaultEffort:'low'})
})
it('creates persistent user tasks using desktop-compatible history',async()=>{
  const fetcher=vi.fn(async (_:unknown,init:any)=>{
    expect(JSON.parse(init.body)).toMatchObject({method:'thread/start',params:{ephemeral:false,historyMode:'paginated',threadSource:'user',cwd:'C:/test'}})
    return new Response(JSON.stringify({result:{thread:{id:'test-thread'}}}))
  })
  vi.stubGlobal('fetch',withControlRequests(fetcher))
  expect((await startThread('C:/test')).threadId).toBe('test-thread')
})
it('does not resolve an upload at 100 percent until the server confirms it',async()=>{
  let request:any
  vi.stubGlobal('XMLHttpRequest',class {upload:any={};status=200;responseText='{"path":"C:/test.txt"}';open(){}send(){request=this}})
  const progress=vi.fn();let settled=false
  const pending=uploadFile(new File(['test'],'test.txt'),progress).then(result=>{settled=true;return result})
  request.upload.onprogress({loaded:4,total:4,lengthComputable:true})
  await Promise.resolve(); expect(settled).toBe(false);expect(progress).toHaveBeenCalledWith(4,4)
  request.onload();expect(await pending).toBe('C:/test.txt')
})
it('reports the reason for a failed upload rather than returning an attachment path',async()=>{
  let request:any
  vi.stubGlobal('XMLHttpRequest',class {upload:any={};open(){}send(){request=this}})
  const pending=expect(uploadFile(new File(['test'],'test.txt'))).rejects.toThrow('连接中断');request.onerror();await pending
})
it('shows a readable error for HTML proxy responses and server size limits',async()=>{
  let request:any
  vi.stubGlobal('XMLHttpRequest',class {upload:any={};status=502;responseText='<!doctype html><html>gateway</html>';open(){}send(){request=this}})
  const failed=expect(uploadFile(new File(['test'],'test.txt'))).rejects.toThrow('HTTP 502');request.onload();await failed
  const large=expect(uploadFile(new File(['test'],'test.txt'))).rejects.toThrow('90 MiB');request.status=413;request.onload();await large
})
