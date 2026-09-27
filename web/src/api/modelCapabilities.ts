import { reactive } from 'vue'
import type { ReasoningEffort } from '../types/codex'
export const modelCapabilities = reactive<Record<string, { efforts: ReasoningEffort[]; defaultEffort: ReasoningEffort }>>({})
export const effortLabels: Record<string,string> = { none:'None', minimal:'Minimal', low:'Low', medium:'Medium', high:'High', xhigh:'Extra high', max:'Max', ultra:'Ultra' }
