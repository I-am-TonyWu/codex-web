import { describe, expect, it } from 'vitest'
import { normalizeCodexTurnInput } from './codexTurnInput'

describe('desktop-compatible user input', () => {
  it.each([undefined, null, 'invalid'])('repairs a missing or invalid text_elements array: %s', elements => {
    const original = [{ type: 'text', text: '中文正文', text_elements: elements }]
    const normalized = normalizeCodexTurnInput(original) as any[]
    // The installed desktop's continuation detector accesses this array directly.
    expect(() => normalized.some(item => item.type === 'text' && item.text_elements.some((el: any) => el.placeholder === 'aeon-continuation'))).not.toThrow()
    expect(normalized[0]).toEqual({ type: 'text', text: '中文正文', text_elements: [] })
    expect(original[0].text_elements).toBe(elements)
  })
  it('preserves existing text elements, images and skill references', () => {
    const elements = [{ placeholder: 'aeon-continuation', byteRange: { start: 0, end: 4 } }]
    const input = [{ type: 'text', text: 'text', text_elements: elements }, { type: 'localImage', path: 'C:/image.png' }, { type: 'skill', name: 'skill', path: 'C:/SKILL.md' }]
    expect(normalizeCodexTurnInput(input)).toEqual(input)
  })
  it('leaves invalid input validation to the native protocol', () => {
    expect(normalizeCodexTurnInput(null)).toBeNull()
    expect(normalizeCodexTurnInput('invalid')).toBe('invalid')
  })
})
