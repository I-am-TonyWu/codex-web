import { afterEach, expect, it, vi } from 'vitest'
import { getAvailableModelIds, startThread, uploadFile } from './codexGateway'
import { modelCapabilities } from './modelCapabilities'
afterEach(() => vi.unstubAllGlobals())
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
  vi.stubGlobal('fetch',fetcher)
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
it('returns failure for a failed upload rather than an attachment path',async()=>{
  let request:any
  vi.stubGlobal('XMLHttpRequest',class {upload:any={};open(){}send(){request=this}})
  const pending=uploadFile(new File(['test'],'test.txt'));request.onerror();expect(await pending).toBeNull()
})
