import { describe, it, expect } from 'vitest'
import { resolveTheme, nextTheme, isTheme } from './theme'

describe('theme helpers', () => {
  it('resolves system to the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('cycles light → dark → system → light', () => {
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
    expect(nextTheme('system')).toBe('light')
  })

  it('guards unknown values', () => {
    expect(isTheme('dark')).toBe(true)
    expect(isTheme('nope')).toBe(false)
    expect(isTheme(null)).toBe(false)
  })
})
