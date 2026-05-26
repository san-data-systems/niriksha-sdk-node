import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock ../index flush so we test withFlush behavior without OTEL init
vi.mock('../index', () => ({
  flush: vi.fn().mockResolvedValue(undefined),
  _state: { baseUrl: '', apiKey: '' },
  isInitialized: vi.fn(() => false),
}))

import { withFlush } from '../serverless'
import { flush } from '../index'

describe('withFlush', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls the wrapped function and returns its result', async () => {
    const fn = vi.fn().mockResolvedValue('result')
    const wrapped = withFlush(fn)

    const result = await wrapped()

    expect(fn).toHaveBeenCalledOnce()
    expect(result).toBe('result')
  })

  it('calls flush after the wrapped function completes', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    const wrapped = withFlush(fn)

    await wrapped()

    expect(flush).toHaveBeenCalledOnce()
  })

  it('calls flush even when the wrapped function throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'))
    const wrapped = withFlush(fn)

    await expect(wrapped()).rejects.toThrow('boom')
    expect(flush).toHaveBeenCalledOnce()
  })

  it('passes arguments through to the wrapped function', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const wrapped = withFlush(fn)

    await wrapped('arg1', 42, { key: 'val' })

    expect(fn).toHaveBeenCalledWith('arg1', 42, { key: 'val' })
  })
})
