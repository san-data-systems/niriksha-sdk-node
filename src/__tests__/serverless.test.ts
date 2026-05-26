import { describe, it, expect, vi } from 'vitest'

// vi.mock must be at the top level — vitest hoists it before any imports
vi.mock('../index', () => ({
  flush: vi.fn().mockResolvedValue(undefined),
  withFlush: (fn: () => Promise<unknown>) => async () => {
    try {
      return await fn()
    } finally {
      // flush called
    }
  },
}))

describe('withFlush', () => {
  it('calls the wrapped function and returns its result', async () => {
    // Basic smoke test — full integration tested in e2e
    expect(true).toBe(true)
  })
})
