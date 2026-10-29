import { describe, it, expect, afterEach, vi } from 'vitest'
import { publicWebUrl, whatsappShareUrl } from './share'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('publicWebUrl', () => {
  it('uses VITE_PUBLIC_WEB_URL when configured, stripping a trailing slash', () => {
    vi.stubEnv('VITE_PUBLIC_WEB_URL', 'https://kym.example.com/')
    expect(publicWebUrl('/passport/abc')).toBe('https://kym.example.com/passport/abc')
  })

  it('falls back to the current web origin in a browser context', () => {
    // No env configured; jsdom provides a real window.location.origin.
    const url = publicWebUrl('/passport/abc')
    expect(url).toBe(`${window.location.origin}/passport/abc`)
  })
})

describe('whatsappShareUrl', () => {
  it('builds a wa.me link with the text URL-encoded', () => {
    expect(whatsappShareUrl('Check my car passport #9/9')).toBe(
      'https://wa.me/?text=Check%20my%20car%20passport%20%239%2F9',
    )
  })
})
