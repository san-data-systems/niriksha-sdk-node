import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @opentelemetry/api before importing baggage module
vi.mock('@opentelemetry/api', () => {
  const entries = new Map<string, { value: string }>()

  const mockBaggage = {
    getEntry: (key: string) => entries.get(key),
    setEntry: (key: string, val: { value: string }) => {
      const next = new Map(entries)
      next.set(key, val)
      return { ...mockBaggage, getEntry: (k: string) => next.get(k), setEntry: mockBaggage.setEntry }
    },
  }

  const mockContext = Symbol('ctx')

  return {
    propagation: {
      getBaggage: vi.fn((_ctx: unknown) => null),
      createBaggage: vi.fn(() => ({ ...mockBaggage })),
      setBaggage: vi.fn((_ctx: unknown, _bag: unknown) => mockContext),
    },
    context: {
      active: vi.fn(() => mockContext),
    },
  }
})

import { setBaggageContext, getBaggage } from '../baggage'
import { propagation, context } from '@opentelemetry/api'

describe('setBaggageContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a new baggage when none exists and sets entry', () => {
    const mockBag = {
      getEntry: vi.fn(),
      setEntry: vi.fn().mockReturnValue({ getEntry: vi.fn(), setEntry: vi.fn() }),
    }
    vi.mocked(propagation.getBaggage).mockReturnValue(null as any)
    vi.mocked(propagation.createBaggage).mockReturnValue(mockBag as any)
    vi.mocked(propagation.setBaggage).mockReturnValue({} as any)

    const ctx = {} as any
    setBaggageContext(ctx, 'tenant.id', 'acme')

    expect(propagation.createBaggage).toHaveBeenCalled()
    expect(mockBag.setEntry).toHaveBeenCalledWith('tenant.id', { value: 'acme' })
    expect(propagation.setBaggage).toHaveBeenCalled()
  })

  it('reuses existing baggage when present', () => {
    const mockBag = {
      getEntry: vi.fn(),
      setEntry: vi.fn().mockReturnValue({ getEntry: vi.fn(), setEntry: vi.fn() }),
    }
    vi.mocked(propagation.getBaggage).mockReturnValue(mockBag as any)

    const ctx = {} as any
    setBaggageContext(ctx, 'key', 'value')

    expect(propagation.createBaggage).not.toHaveBeenCalled()
    expect(mockBag.setEntry).toHaveBeenCalledWith('key', { value: 'value' })
  })

  it('returns the new context from setBaggage', () => {
    const newCtx = Symbol('newCtx')
    vi.mocked(propagation.getBaggage).mockReturnValue(null as any)
    vi.mocked(propagation.createBaggage).mockReturnValue({
      setEntry: vi.fn().mockReturnValue({}),
    } as any)
    vi.mocked(propagation.setBaggage).mockReturnValue(newCtx as any)

    const result = setBaggageContext({} as any, 'k', 'v')
    expect(result).toBe(newCtx)
  })
})

describe('getBaggage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the value for an existing key', () => {
    vi.mocked(propagation.getBaggage).mockReturnValue({
      getEntry: vi.fn((key: string) => key === 'tenant.id' ? { value: 'acme' } : undefined),
    } as any)

    expect(getBaggage('tenant.id')).toBe('acme')
  })

  it('returns undefined when key does not exist', () => {
    vi.mocked(propagation.getBaggage).mockReturnValue({
      getEntry: vi.fn(() => undefined),
    } as any)

    expect(getBaggage('missing')).toBeUndefined()
  })

  it('returns undefined when no baggage on context', () => {
    vi.mocked(propagation.getBaggage).mockReturnValue(null as any)

    expect(getBaggage('key')).toBeUndefined()
  })
})
