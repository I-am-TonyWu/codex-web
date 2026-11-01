// Actual application, isolated responses and browser storage; no external task calls.
import { createApp } from 'vue'
import '../../src/style.css'
const query = new URL(location.href).searchParams
localStorage.setItem('codex-web-local.ui-language.v1', 'zh-CN')
localStorage.setItem('codex-web-local.dark-mode.v1', query.get('theme') || 'dark')
localStorage.setItem('codex-web-local.sidebar-collapsed.v1', '0')
const id = '11111111-1111-4111-8111-111111111111'
const freeId = '22222222-2222-4222-8222-222222222222'
const memberships: Record<string, string | null> = JSON.parse(localStorage.getItem('ui-refresh-memberships') || 'null') || { [id]: 'alpha', [freeId]: null }
const projects = [
  { id:'alpha', name:'变更评审', rootPaths:['C:/Fixture/engineering'] },
  { id:'empty', name:'空项目', rootPaths:['C:/Fixture/empty'] },
  { id:'target', name:'网页接续', rootPaths:['C:/Fixture/continuation'] },
]
const threads = [id,freeId].map((threadId,index)=>({ id:threadId, name:index?'独立聊天 · 项目归属验证':'网页显示优化 · 标题菜单和控制状态', projectId:memberships[threadId],
  cwd:index?'C:/Fixture/projectless':'C:/Fixture/engineering', preview:'检查侧栏与标题菜单',source:'appServer',createdAt:1791970000,updatedAt:1792070000,status:{type:'idle'},
  turns:[{id:'fixture-turn',status:'completed',items:[{id:'fixture-answer',type:'agentMessage',phase:'final_answer',text:'已整理变更资料，保留当前工作目录和历史记录。下一步可以核对项目归属与菜单选项。'}]}] }))
const desktop = query.get('desktop')
if (desktop) {
  threads[0]!.status.type = desktop === 'running' ? 'active' : 'notLoaded'
  threads[0]!.turns[0]!.status = desktop === 'running' ? 'inProgress' : desktop === 'completed' ? 'completed' : 'interrupted'
}
const nativeFetch = window.fetch.bind(window)
window.WebSocket = class { readyState=0; close(){this.readyState=3} send(){} } as unknown as typeof WebSocket
window.fetch = async (input,init) => {
  const url = new URL(input instanceof Request?input.url:String(input),location.href)
  if(!url.pathname.startsWith('/codex-api/')) return nativeFetch(input,init)
  const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}')
  const control = {threadId:body.threadId||url.searchParams.get('threadId')||id,epoch:'fixture',version:1,owner:desktop?null:{id:'fixture',label:'本网页'},proof:desktop?null:{epoch:'fixture',version:1,token:'fixture'},activity:desktop==='running'?'running':desktop==='unknown'?'unknown':'idle',turnId:null,transferring:false,executionSource:desktop?'desktop':'web'}
  let json: unknown = {data:[],result:{},pins:[],titles:{},prompts:[]}
  if(url.pathname.startsWith('/codex-api/control/')) json = url.pathname.endsWith('/register')?{data:{id:'fixture',key:'fixture'}}:{data:control}
  if(url.pathname==='/codex-api/workspace-roots-state') json={data:{order:projects.flatMap(p=>p.rootPaths),labels:{},active:[],projectOrder:projects.map(p=>p.id),localProjects:projects,
    threadProjectAssignments:Object.fromEntries(Object.entries(memberships).filter(([,value])=>value)),projectlessThreadIds:Object.keys(memberships).filter(key=>!memberships[key])}}
  if(url.pathname==='/codex-api/thread-project') {
    if(query.has('fail')) return new Response(JSON.stringify({error:'项目保存失败，请稍后重试'}),{status:409,headers:{'content-type':'application/json'}})
    memberships[body.threadId]=body.projectId
    threads.find(thread=>thread.id===body.threadId)!.projectId=body.projectId
    localStorage.setItem('ui-refresh-memberships',JSON.stringify(memberships));json={ok:true}
  }
  if(url.pathname==='/codex-api/thread-titles')json={titles:Object.fromEntries(threads.map(thread=>[thread.id,thread.name]))}
  if(url.pathname==='/codex-api/thread-terminal/status')json={available:true,reason:null}
  if(url.pathname==='/codex-api/meta/methods')json={data:['plugin/list','plugin/read','plugin/install','app/list','mcpServerStatus/list','skills/config/write']}
  if(url.pathname==='/codex-api/extensions')json={plugins:{marketplaces:[{name:'local',plugins:[{id:'installed@local',name:'已安装插件',installed:true,enabled:true,interface:{displayName:'文档工具'}}]}]},skills:{data:[]},syncing:false,syncError:''}
  if(url.pathname==='/codex-api/skills-hub')json={installed:[{name:'personal-check',owner:'local',description:'检查工程文档的变更记录，保留全部数据与来源。',translationStatus:'ready',url:'',installed:true,enabled:true,path:'C:/Fixture/skills/personal-check/SKILL.md'}]}
  if(url.pathname==='/codex-api/skills-hub/readme')json={description:'检查工程文档的变更记录，保留全部数据与来源。',content:'# 文档检查\n\n保留完整步骤与来源。',translationStatus:'ready'}
  if(url.pathname==='/codex-api/git/branches')json={data:{gitRoot:'C:/Fixture/engineering',currentBranch:'main',detached:false,dirty:false,options:[{label:'main',value:'main'}]}}
  if(url.pathname==='/codex-api/git/status')json={data:{isGitRepo:true}}
  if(url.pathname==='/codex-api/rpc') {
    const {method,params}=body;let result:unknown={}
    if(method==='thread/list') {
      if(query.has('error'))return new Response(JSON.stringify({error:{message:'无法加载聊天，请重试'}}),{status:500,headers:{'content-type':'application/json'}})
      result={data:threads,nextCursor:null}
    }
    if(method==='thread/read'||method==='thread/resume')result={thread:threads.find(thread=>thread.id===params.threadId)||threads[0]}
    if(method==='model/list')result={data:[{id:'fixture-model',model:'fixture-model',displayName:'测试模型',defaultReasoningEffort:'high',supportedReasoningEfforts:[{reasoningEffort:'high',description:'High'}]}]}
    if(method==='config/read')result={config:{model:'fixture-model',model_provider:'openai'}}
    if(method==='account/rateLimits/read')result={rateLimits:{limitId:'codex',primary:{usedPercent:43,windowDurationMins:300,resetsAt:1792079000},secondary:{usedPercent:9,windowDurationMins:10080,resetsAt:1792660000}}}
    if(method==='mcpServerStatus/list')result={data:[{name:'文档连接',tools:{read:{}},resources:[],resourceTemplates:[],authStatus:'unsupported'}],nextCursor:null}
    if(/^(turn\/|thread\/(start|fork|rollback|archive|name\/set))/.test(method))throw Error('Fixture forbids task mutations: '+method)
    json={result,...(method==='thread/resume'?{control}:{})}
  }
  return new Response(JSON.stringify(json),{headers:{'content-type':'application/json'}})
}
if(!location.hash)location.hash='#/thread/'+id
const [{default:App},{default:router}]=await Promise.all([import('../../src/App.vue'),import('../../src/router')])
const { installFeedbackDiagnostics } = await import('../../src/composables/useFeedbackDiagnostics')
installFeedbackDiagnostics()
createApp(App).use(router).mount('#app')
