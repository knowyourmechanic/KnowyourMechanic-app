import { describe, it, expect } from 'vitest'
import { distanceKm, formatDistance, normalizePlate } from './customer'

describe('distanceKm', () => {
  it('is zero for the same point', () => {
    expect(distanceKm(19.076, 72.877, 19.076, 72.877)).toBe(0)
  })

  it('matches the great-circle distance for one degree of latitude (~111 km)', () => {
    expect(distanceKm(0, 0, 1, 0)).toBeCloseTo(111.19, 1)
  })

  it('is symmetric', () => {
    const a = distanceKm(19.0, 72.8, 19.1, 72.9)
    const b = distanceKm(19.1, 72.9, 19.0, 72.8)
    expect(a).toBeCloseTo(b, 10)
  })
})

describe('formatDistance', () => {
  it('shows metres below 1 km', () => {
    expect(formatDistance(0.5)).toBe('500 m')
    expect(formatDistance(0.05)).toBe('50 m')
  })

  it('shows one decimal of km at 1 km and above', () => {
    expect(formatDistance(1)).toBe('1.0 km')
    expect(formatDistance(2.345)).toBe('2.3 km')
  })
})

describe('normalizePlate', () => {
  it('strips spaces and hyphens and upper-cases', () => {
    expect(normalizePlate(' mh 12-ab 1234 ')).toBe('MH12AB1234')
  })

  it('returns an empty string for nullish input', () => {
    expect(normalizePlate(null)).toBe('')
    expect(normalizePlate(undefined)).toBe('')
  })
})
