import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('internal logger', () => {
  beforeEach(() => {
    delete process.env['NIRIKSHA_LOG_LEVEL']
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('suppresses debug messages at default warn level', async () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { logger } = await import('../internal/logger')
    logger.debug('test message')
    expect(spy).not.toHaveBeenCalled()
  })

  it('shows warn messages at default warn level', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { logger } = await import('../internal/logger')
    logger.warn('test warning')
    expect(spy).toHaveBeenCalledWith('[NirikshaAI]', 'test warning')
  })

  it('shows error messages at default warn level', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { logger } = await import('../internal/logger')
    logger.error('test error', { code: 500 })
    expect(spy).toHaveBeenCalledWith('[NirikshaAI]', 'test error', { code: 500 })
  })
})
