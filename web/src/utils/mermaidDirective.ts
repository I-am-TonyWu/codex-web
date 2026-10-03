import { createVNode, render, type Directive } from 'vue'
import MermaidDiagram from '../components/content/MermaidDiagram.vue'
type MountedDiagram = { source: string; pending: boolean }
const roots = new WeakMap<HTMLElement, Map<HTMLElement, MountedDiagram>>()
function refresh(root: HTMLElement): void {
  const mounted = roots.get(root) ?? new Map<HTMLElement, MountedDiagram>()
  roots.set(root, mounted)
  for (const host of mounted.keys()) if (!root.contains(host)) { render(null, host); mounted.delete(host) }
  for (const host of root.querySelectorAll<HTMLElement>('.message-mermaid-host')) {
    const previous = mounted.get(host)
    const pending = (host.closest('[data-message-type]')?.getAttribute('data-message-type') ?? '').endsWith('.live')
    if (previous && previous.pending === pending) continue
    const source = previous?.source ?? host.textContent ?? ''
    mounted.set(host, { source, pending })
    render(createVNode(MermaidDiagram, { source, pending }), host)
  }
}
// Nested Markdown lists and plans use v-html rather than Vue's normal code-block template.
export const vMermaid: Directive<HTMLElement> = {
  mounted: refresh,
  updated: refresh,
  beforeUnmount(root) { for (const host of roots.get(root)?.keys() ?? []) render(null, host); roots.delete(root) },
}
