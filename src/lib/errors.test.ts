import { describe, it, expect } from 'vitest'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  it('reads the message off an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })

  it('reads .message off a plain object (e.g. a Supabase error)', () => {
    expect(errorMessage({ message: 'row level security' })).toBe('row level security')
  })

  it('returns a string error as-is', () => {
    expect(errorMessage('just a string')).toBe('just a string')
  })

  it('uses the fallback for empty or shapeless values', () => {
    expect(errorMessage(null)).toBe('Something went wrong. Please try again.')
    expect(errorMessage(new Error(''))).toBe('Something went wrong. Please try again.')
    expect(errorMessage({ message: 42 })).toBe('Something went wrong. Please try again.')
    expect(errorMessage(undefined, 'custom fallback')).toBe('custom fallback')
  })
})
