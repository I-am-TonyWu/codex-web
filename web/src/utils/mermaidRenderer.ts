type MermaidApi = (typeof import('mermaid'))['default']
let loader: Promise<MermaidApi> | null = null
let queue: Promise<unknown> = Promise.resolve()
let renderId = 0
let cachedBytes = 0
const cache = new Map<string, string>()
const inFlight = new Map<string, Promise<string>>()
const MAX_TEXT = 50_000
const MAX_CACHE_BYTES = 4_000_000
const MAX_CACHE_ENTRIES = 24

export function isMermaidLanguage(language: string): boolean {
  return language.trim().toLowerCase() === 'mermaid'
}

function loadMermaid(): Promise<MermaidApi> {
  if (!loader) loader = import('mermaid').then(module => module.default).catch(error => {
    loader = null
    throw error
  })
  return loader
}

// Mermaid has global configuration. Serialize theme changes with rendering and share identical work.
export function renderMermaid(source: string, dark: boolean): Promise<string> {
  if (!source.trim()) return Promise.reject(new Error('流程图内容为空。'))
  if (source.length > MAX_TEXT) return Promise.reject(new Error('流程图过长，请拆成几个较小的图表。'))
  const key = `${dark ? 'dark' : 'light'}\0${source}`
  const cached = cache.get(key)
  if (cached !== undefined) {
    cache.delete(key)
    cache.set(key, cached)
    return Promise.resolve(cached)
  }
  const existing = inFlight.get(key)
  if (existing) return existing
  const work = queue.then(async () => {
    const mermaid = await loadMermaid()
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      maxTextSize: MAX_TEXT,
      maxEdges: 500,
      theme: dark ? 'dark' : 'default',
      fontFamily: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif',
      htmlLabels: false,
      flowchart: { htmlLabels: false, useMaxWidth: true },
    })
    const stage = document.createElement('div')
    stage.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none;'
    document.body.append(stage)
    try {
      const { svg } = await mermaid.render(`codex-mermaid-${++renderId}`, source, stage)
      if (svg.length <= MAX_CACHE_BYTES) {
        cache.set(key, svg)
        cachedBytes += svg.length
        while (cache.size > MAX_CACHE_ENTRIES || cachedBytes > MAX_CACHE_BYTES) {
          const oldest = cache.keys().next().value
          if (oldest === undefined) break
          cachedBytes -= cache.get(oldest)?.length ?? 0
          cache.delete(oldest)
        }
      }
      return svg
    } finally {
      stage.remove()
    }
  })
  queue = work.catch(() => undefined)
  inFlight.set(key, work)
  void work.finally(() => inFlight.delete(key)).catch(() => undefined)
  return work
}

// Cached SVG can appear in several messages or the enlarged view. Give every instance unique IDs.
export function namespaceMermaidSvg(svg: string, prefix: string): string {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') throw new Error('流程图格式无效。')
  const viewBox = parsed.documentElement.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
  if (viewBox?.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2]! > 0) {
    parsed.documentElement.setAttribute('width', String(Math.ceil(viewBox[2]!)))
  }
  const elements = [parsed.documentElement, ...parsed.documentElement.querySelectorAll('*')]
  const ids = new Map<string, string>()
  for (const element of elements) {
    const id = element.getAttribute('id')
    if (id) ids.set(id, `${prefix}-${id}`)
  }
  for (const element of elements) {
    const id = element.getAttribute('id')
    if (id) element.setAttribute('id', ids.get(id)!)
    for (const attribute of [...element.attributes]) {
      if (attribute.name === 'id') continue
      let value = attribute.value.replace(/url\(#([^)]+)\)/g, (all, id: string) => ids.has(id) ? `url(#${ids.get(id)})` : all)
      if (attribute.localName === 'href' && value.startsWith('#') && ids.has(value.slice(1))) value = `#${ids.get(value.slice(1))}`
      if (attribute.name === 'aria-labelledby' || attribute.name === 'aria-describedby') value = value.split(/\s+/).map(id => ids.get(id) ?? id).join(' ')
      if (value !== attribute.value) element.setAttribute(attribute.name, value)
    }
    if (element.localName === 'style') {
      let css = element.textContent ?? ''
      for (const [oldId, newId] of ids) css = css.replace(new RegExp(`#${oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'g'), `#${newId}`)
      element.textContent = css
    }
  }
  return new XMLSerializer().serializeToString(parsed.documentElement)
}
