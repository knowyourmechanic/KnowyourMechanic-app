import { describe, it, expect } from 'vitest'
import {
  parseServiceHours,
  normalizeWorkingDays,
  getOpenStatus,
  openLabel,
  type OpenStatus,
} from './hours'

// A stand-in for the real i18n translator: echoes the key and fills {vars}, so
// we can assert which branch openLabel took without depending on the dictionary.
const t = (key: string, vars?: Record<string, string | number>) => {
  if (!vars) return key
  let s = key
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}

describe('parseServiceHours', () => {
  it('parses a standard range into minutes and labels', () => {
    expect(parseServiceHours('9:00 AM - 8:00 PM')).toEqual({
      open: 9 * 60,
      close: 20 * 60,
      openLabel: '9:00 AM',
      closeLabel: '8:00 PM',
    })
  })

  it('handles 12 AM (midnight) and 12 PM (noon) correctly', () => {
    const r = parseServiceHours('12:00 AM - 12:00 PM')
    expect(r).not.toBeNull()
    expect(r!.open).toBe(0)
    expect(r!.close).toBe(12 * 60)
  })

  it('returns null for unparseable input', () => {
    expect(parseServiceHours('')).toBeNull()
    expect(parseServiceHours(null)).toBeNull()
    expect(parseServiceHours('open all day')).toBeNull()
  })
})

describe('normalizeWorkingDays', () => {
  it('trims and drops blanks from an array', () => {
    expect(normalizeWorkingDays([' Mon ', 'Tue', '', 'Wed'])).toEqual(['Mon', 'Tue', 'Wed'])
  })

  it('splits a comma string', () => {
    expect(normalizeWorkingDays('Mon, Tue,Wed')).toEqual(['Mon', 'Tue', 'Wed'])
  })

  it('returns [] for nullish', () => {
    expect(normalizeWorkingDays(null)).toEqual([])
    expect(normalizeWorkingDays(undefined)).toEqual([])
  })
})

describe('getOpenStatus', () => {
  // 2026-01-05 is a Monday.
  const monday = (h: number, m = 0) => new Date(2026, 0, 5, h, m)

  it('reports unknown when hours cannot be parsed', () => {
    const s = getOpenStatus(null, null, monday(10))
    expect(s).toEqual({ known: false, isOpen: false, state: 'unknown' })
  })

  it('is open inside a normal daytime range', () => {
    const s = getOpenStatus('9:00 AM - 8:00 PM', null, monday(10))
    expect(s.state).toBe('open')
    expect(s.isOpen).toBe(true)
    expect(s.time).toBe('8:00 PM') // shows closing time while open
  })

  it('is closed before opening, showing the opening time', () => {
    const s = getOpenStatus('9:00 AM - 8:00 PM', null, monday(7))
    expect(s.state).toBe('closed')
    expect(s.isOpen).toBe(false)
    expect(s.time).toBe('9:00 AM')
  })

  it('handles an overnight range that wraps past midnight', () => {
    expect(getOpenStatus('10:00 PM - 2:00 AM', null, monday(23)).isOpen).toBe(true)
    expect(getOpenStatus('10:00 PM - 2:00 AM', null, monday(1)).isOpen).toBe(true)
    expect(getOpenStatus('10:00 PM - 2:00 AM', null, monday(15)).isOpen).toBe(false)
  })

  it('is closedToday on a day the garage does not work', () => {
    // Monday with working days Tue–Sat.
    const s = getOpenStatus('9:00 AM - 8:00 PM', ['Tue', 'Wed', 'Thu', 'Fri', 'Sat'], monday(10))
    expect(s.state).toBe('closedToday')
    expect(s.isOpen).toBe(false)
  })

  it('respects a working day that includes today', () => {
    const s = getOpenStatus('9:00 AM - 8:00 PM', ['Mon'], monday(10))
    expect(s.state).toBe('open')
  })
})

describe('openLabel', () => {
  const base: OpenStatus = { known: true, isOpen: true, state: 'open', time: '8:00 PM' }

  it('maps each state to the right translation key', () => {
    expect(openLabel({ ...base, state: 'unknown' }, t)).toBe('hours.notListed')
    expect(openLabel({ ...base, state: 'closedToday' }, t)).toBe('hours.closedToday')
    expect(openLabel({ ...base, state: 'open', time: '8:00 PM' }, t)).toBe('hours.openCloses')
    expect(openLabel({ ...base, state: 'closed', time: '9:00 AM' }, t)).toBe('hours.closedOpens')
  })
})
