import { createApp, h, ref } from 'vue'
import Conversation from '../../../src/components/content/ThreadConversation.vue'
import { renderMermaid, namespaceMermaidSvg } from '../../../src/utils/mermaidRenderer'
import type { UiMessage } from '../../../src/types/codex'
import '../../../src/style.css'

// Synthetic messages exercise the real renderer without starting a model turn.
const messages = ref<UiMessage[]>([{ id: 'testchat-mermaid', role: 'assistant', text: 'TestChat ready.' }])
Object.assign(window, {
  mermaidTest: {
    setMessages(value: UiMessage[]) { messages.value = value },
    renderMermaid, namespaceMermaidSvg,
  },
})
createApp({ setup: () => () => h('main', {
  style: 'height:100dvh;display:flex;flex-direction:column;max-width:1000px;margin:auto',
}, [h(Conversation, {
  messages: messages.value, pendingRequests: [], liveOverlay: null, isLoading: false,
  activeThreadId: 'testchat-mermaid', cwd: 'C:/TestChat',
})]) }).mount('#app')
