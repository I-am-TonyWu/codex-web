import { afterEach, describe, expect, it, vi } from 'vitest'
import { getExtensions, getSkillsList, startThreadTurn } from './codexGateway'
import { describeExtension } from '../utils/extensionDescriptions'

afterEach(() => vi.unstubAllGlobals())
describe('extension selections', () => {
  it('keeps full descriptions, exact Windows paths and distinct nested skills; shares a request', async () => {
    const skills = [
      {name:'parent', path:'C:\\skills\\parent\\SKILL.md', description:'full description', shortDescription:'short'},
      {name:'child', path:'C:\\skills\\parent\\child\\SKILL.md', description:'child full description'},
    ]
    const fetcher = vi.fn(async () => new Response(JSON.stringify({skills:{data:[{skills},{skills}]},plugins:{marketplaces:[]}})))
    vi.stubGlobal('fetch', fetcher)
    const [result] = await Promise.all([getSkillsList(['C:/test-extensions']),getExtensions(['C:/test-extensions'])])
    expect(result).toHaveLength(2)
    expect(result[0].path).toBe(skills[0].path)
    expect(result[0].description).toBe('full description')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('sends plugins as native mentions and skills as skill inputs', async () => {
    let payload: any
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      payload = JSON.parse(init.body)
      return new Response(JSON.stringify({result:{turn:{id:'test'}}}))
    }))
    await startThreadTurn('thread-test','test',[],'gpt-6-astra','low',[
      {name:'vercel',path:'plugin://vercel@openai-curated-remote'},
      {name:'my-skill',path:'C:\\skills\\mine\\SKILL.md'},
    ])
    expect(payload.params.input).toEqual(expect.arrayContaining([
      {type:'mention',name:'vercel',path:'plugin://vercel@openai-curated-remote'},
      {type:'skill',name:'my-skill',path:'C:\\skills\\mine\\SKILL.md'},
    ]))
  })
  it('preserves Chinese originals, provides known summaries and retains unknown descriptions', () => {
    expect(describeExtension('vercel:auth','英文说明')).toBe('英文说明')
    expect(describeExtension('vercel:auth','Authentication guide')).toContain('身份认证')
    expect(describeExtension('my-new-skill','Custom English instructions')).toBe('Custom English instructions')
  })
})
