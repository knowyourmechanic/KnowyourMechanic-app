import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nProvider, useI18n } from './index'

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>

const render = () => renderHook(() => useI18n(), { wrapper })

beforeEach(() => {
  localStorage.clear()
})

describe('useI18n translator', () => {
  it('translates a known key and defaults to English', () => {
    const { result } = render()
    expect(result.current.lang).toBe('en')
    expect(result.current.t('common.back')).toBe('Back')
  })

  it('substitutes {vars} into a message', () => {
    const { result } = render()
    expect(result.current.t('hours.openCloses', { time: '8:00 PM' })).toBe('Open · closes 8:00 PM')
  })

  it('returns the key itself when no translation exists', () => {
    const { result } = render()
    // @ts-expect-error — exercising the missing-key fallback path on purpose
    expect(result.current.t('this.key.does.not.exist')).toBe('this.key.does.not.exist')
  })

  it('switches language, persists the choice, and routes to that dictionary', () => {
    const { result } = render()
    act(() => result.current.setLang('hi'))

    expect(result.current.lang).toBe('hi')
    expect(localStorage.getItem('lang')).toBe('hi')
    // Hindi is fully translated, so a known key should differ from English.
    expect(result.current.t('common.back')).not.toBe('Back')
    expect(result.current.t('common.back').length).toBeGreaterThan(0)
  })

  it('uses Latin numerals in the locale for OTPs and amounts', () => {
    const { result } = render()
    act(() => result.current.setLang('mr'))
    expect(result.current.locale).toBe('mr-IN-u-nu-latn')
  })
})
