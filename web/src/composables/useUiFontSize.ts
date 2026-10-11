import { computed, ref } from 'vue'

const STORAGE_KEY = 'codex-web-local.font-scale.v1'
const SCALES = [100, 110, 125, 150] as const

function readScale(): number {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY))
    return SCALES.includes(stored as typeof SCALES[number]) ? stored : 100
  } catch { return 100 }
}

const fontScale = ref(readScale())
function applyScale(): void {
  if (typeof document !== 'undefined') document.documentElement.style.fontSize = `${16 * fontScale.value / 100}px`
}
applyScale()

export function useUiFontSize() {
  function setFontScale(scale: number): void {
    if (!SCALES.includes(scale as typeof SCALES[number])) return
    fontScale.value = scale
    applyScale()
    // Restricted browser storage must not prevent adjusting the current page.
    try { window.localStorage.setItem(STORAGE_KEY, String(scale)) } catch { /* session only */ }
  }
  return {
    fontScale,
    canDecreaseFont: computed(() => fontScale.value > SCALES[0]),
    canIncreaseFont: computed(() => fontScale.value < SCALES[SCALES.length - 1]!),
    decreaseFont: () => setFontScale(SCALES[Math.max(0, SCALES.indexOf(fontScale.value as typeof SCALES[number]) - 1)]!),
    increaseFont: () => setFontScale(SCALES[Math.min(SCALES.length - 1, SCALES.indexOf(fontScale.value as typeof SCALES[number]) + 1)]!),
    resetFont: () => setFontScale(100),
  }
}
