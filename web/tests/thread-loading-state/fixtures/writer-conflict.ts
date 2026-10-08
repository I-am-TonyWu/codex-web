import { createApp, h, ref } from 'vue'
import Conversation from '../../../src/components/content/ThreadConversation.vue'
import { THREAD_WRITER_CONFLICT_MESSAGE } from '../../../src/api/codexErrors'
import type { UiLiveOverlay, UiMessage } from '../../../src/types/codex'
import '../../../src/style.css'

const busy = ref(false)
const messages = ref<UiMessage[]>([])
const overlay = ref<UiLiveOverlay | null>(null)
const events: string[] = []
Object.assign(window, { writerTest: {
  events,
  setError(live: boolean) {
    busy.value = false
    messages.value = live ? [] : [{ id: 'error', role: 'assistant', messageType: 'turnError', text: THREAD_WRITER_CONFLICT_MESSAGE }]
    overlay.value = live ? { reasoningText: '', errorText: THREAD_WRITER_CONFLICT_MESSAGE } as UiLiveOverlay : null
  },
} })
createApp({ setup: () => () => h('main', { style: 'height:100dvh;display:flex;flex-direction:column;max-width:1000px;margin:auto' }, [
  h(Conversation, { messages: messages.value, pendingRequests: [], liveOverlay: overlay.value, isLoading: false,
    activeThreadId: 'desktop-owned', cwd: 'C:/Fixture', isContinuingOnWeb: busy.value,
    onContinueOnWeb: (id: string) => { events.push(id); busy.value = true },
  }),
]) }).mount('#app')
