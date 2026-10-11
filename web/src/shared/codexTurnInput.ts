/** Desktop clients inspect text_elements directly before the app-server decodes input. */
export function normalizeCodexTurnInput(input: unknown): unknown {
  if (!Array.isArray(input)) return input
  return input.map(item => item && typeof item === 'object' && item.type === 'text'
    ? { ...item, text_elements: Array.isArray(item.text_elements) ? item.text_elements : [] }
    : item)
}
