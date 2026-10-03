<template>
  <div ref="card" class="mermaid-card" :data-state="pending ? 'pending' : error ? 'error' : svg ? 'ready' : 'loading'">
    <div class="mermaid-toolbar">
      <span>流程图</span>
      <div class="mermaid-actions">
        <button type="button" :aria-pressed="showSource" @click="showSource = !showSource">{{ showSource ? '查看图表' : '查看代码' }}</button>
        <button v-if="svg" type="button" @click="expanded = true">放大</button>
      </div>
    </div>
    <p v-if="pending" class="mermaid-status" role="status">流程图生成中…</p>
    <div v-else-if="!svg && !error" class="mermaid-status" role="status"><span class="mermaid-spinner" aria-hidden="true"></span>正在绘制流程图…</div>
    <div v-if="error" class="mermaid-error" role="status">
      <p>暂时无法绘制流程图，原始代码已保留。</p>
      <details><summary>查看原因</summary><pre>{{ error }}</pre></details>
      <button type="button" @click="draw">重试</button>
    </div>
    <pre v-if="showSource || error" class="mermaid-source"><code>{{ source }}</code></pre>
    <div v-else-if="svg && !pending" class="mermaid-diagram" role="img" aria-label="Mermaid 流程图" v-html="svg"></div>
    <Teleport to="body">
      <div v-if="expanded" class="mermaid-modal-backdrop" @click.self="expanded = false" @keydown.esc.stop="expanded = false">
        <section ref="dialog" class="mermaid-modal" role="dialog" aria-modal="true" aria-label="放大流程图" tabindex="-1">
          <header class="mermaid-toolbar"><span>流程图</span><button type="button" @click="expanded = false">关闭</button></header>
          <div class="mermaid-modal-diagram" v-html="enlargedSvg"></div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { namespaceMermaidSvg, renderMermaid } from '../../utils/mermaidRenderer'
const props = withDefaults(defineProps<{ source: string; pending?: boolean }>(), { pending: false })
const card = ref<HTMLElement | null>(null)
const dialog = ref<HTMLElement | null>(null)
const visible = ref(false)
const dark = ref(false)
const rawSvg = ref('')
const error = ref('')
const showSource = ref(false)
const expanded = ref(false)
const prefix = `diagram-${Math.random().toString(36).slice(2)}`
const svg = computed(() => rawSvg.value ? namespaceMermaidSvg(rawSvg.value, `${prefix}-inline`) : '')
const enlargedSvg = computed(() => rawSvg.value ? namespaceMermaidSvg(rawSvg.value, `${prefix}-large`) : '')
let revision = 0
let alive = true
let viewportObserver: IntersectionObserver | null = null
let themeObserver: MutationObserver | null = null
let sizeObserver: ResizeObserver | null = null

async function draw(): Promise<void> {
  const version = ++revision
  error.value = ''
  if (!alive || !visible.value || props.pending) return
  try {
    const rendered = await renderMermaid(props.source, dark.value)
    if (alive && version === revision) rawSvg.value = rendered
  } catch (reason) {
    if (alive && version === revision) {
      rawSvg.value = ''
      error.value = (reason instanceof Error ? reason.message : String(reason)).slice(0, 800)
    }
  }
}
watch([() => props.source, () => props.pending, dark, visible], () => { void draw() })
watch(() => props.source, () => { rawSvg.value = ''; expanded.value = false })
watch(expanded, async value => { if (value) { await nextTick(); dialog.value?.focus() } })
onMounted(() => {
  dark.value = document.documentElement.classList.contains('dark')
  themeObserver = new MutationObserver(() => { dark.value = document.documentElement.classList.contains('dark') })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  if (typeof ResizeObserver !== 'undefined' && card.value) {
    let lastHeight = 0
    sizeObserver = new ResizeObserver(entries => {
      const height = entries[0]?.contentRect.height ?? 0
      if (height !== lastHeight) {
        lastHeight = height
        card.value?.dispatchEvent(new CustomEvent('mermaid-resize', { bubbles: true }))
      }
    })
    sizeObserver.observe(card.value)
  }
  if (typeof IntersectionObserver === 'undefined') visible.value = true
  else {
    viewportObserver = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { visible.value = true; viewportObserver?.disconnect() }
    }, { rootMargin: '160px' })
    if (card.value) viewportObserver.observe(card.value)
  }
})
onBeforeUnmount(() => { alive = false; revision++; viewportObserver?.disconnect(); themeObserver?.disconnect(); sizeObserver?.disconnect() })
</script>

<style>
.mermaid-card{margin:14px 0;border:1px solid #d4d4d8;border-radius:12px;overflow:hidden;min-width:0;background:#fafafa;color:#27272a}
.mermaid-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid #e4e4e7;font-size:13px;font-weight:500}
.mermaid-actions{display:flex;gap:8px}.mermaid-toolbar button,.mermaid-error button{border:1px solid #d4d4d8;border-radius:7px;background:transparent;color:inherit;padding:4px 10px;font-size:12px;cursor:pointer}
.mermaid-toolbar button:hover,.mermaid-error button:hover{background:#e4e4e7}.mermaid-status{display:flex;align-items:center;justify-content:center;gap:10px;min-height:90px;margin:0;color:#71717a;font-size:13px}
.mermaid-spinner{width:16px;height:16px;border:2px solid #d4d4d8;border-top-color:#71717a;border-radius:50%;animation:mermaid-spin .9s linear infinite}@keyframes mermaid-spin{to{transform:rotate(360deg)}}
.mermaid-diagram{overflow:auto;padding:16px;text-align:center}.mermaid-diagram svg{display:block;max-width:100%!important;height:auto;margin:auto}.mermaid-source{margin:0;padding:16px;overflow:auto;white-space:pre;font:13px/1.65 Consolas,monospace;max-height:520px}.mermaid-source code{background:none;color:inherit}
.mermaid-error{padding:14px;font-size:13px}.mermaid-error p{margin:0 0 10px}.mermaid-error details{margin-bottom:10px}.mermaid-error pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}
.mermaid-modal-backdrop{position:fixed;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.7)}.mermaid-modal{display:flex;flex-direction:column;width:min(1400px,100%);height:90dvh;background:#fff;color:#27272a;border:1px solid #d4d4d8;border-radius:14px;overflow:hidden;outline:none}.mermaid-modal-diagram{flex:1;min-height:0;overflow:auto;padding:24px}.mermaid-modal-diagram svg{display:block;max-width:none!important;height:auto;margin:auto}
@media(max-width:600px){.mermaid-toolbar{padding:8px 10px;gap:8px}.mermaid-diagram{padding:10px}.mermaid-modal-backdrop{padding:8px}.mermaid-modal-diagram{padding:12px}.mermaid-modal{height:94dvh}}@media(prefers-reduced-motion:reduce){.mermaid-spinner{animation:none}}
</style>
