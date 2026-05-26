import { describe, it, expect } from 'vitest'
import { redactPii } from '../pii'

describe('redactPii', () => {
  it('redacts email addresses', () => {
    expect(redactPii('contact user@example.com please')).toBe('contact [REDACTED_EMAIL] please')
  })

  it('redacts US phone numbers', () => {
    expect(redactPii('call 555-123-4567 now')).toBe('call [REDACTED_PHONE] now')
  })

  it('redacts SSNs', () => {
    expect(redactPii('ssn 123-45-6789 found')).toBe('ssn [REDACTED_SSN] found')
  })

  it('redacts credit card numbers', () => {
    expect(redactPii('card 4111 1111 1111 1111 ok')).toBe('card [REDACTED_CC] ok')
  })

  it('returns unchanged string when no PII found', () => {
    expect(redactPii('hello world')).toBe('hello world')
  })

  it('does not mutate input string', () => {
    const input = 'email: test@test.com'
    redactPii(input)
    expect(input).toBe('email: test@test.com')
  })
})
