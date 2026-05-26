import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @opentelemetry/api before importing middleware
vi.mock('@opentelemetry/api', () => {
  const mockSpan = {
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    end: vi.fn(),
    addEvent: vi.fn(),
    recordException: vi.fn(),
  }

  const mockTracer = {
    startSpan: vi.fn(() => mockSpan),
  }

  return {
    trace: {
      getTracer: vi.fn(() => mockTracer),
      setSpan: vi.fn((_ctx: unknown, _span: unknown) => 'span-ctx'),
    },
    context: {
      active: vi.fn(() => 'active-ctx'),
      with: vi.fn((_ctx: unknown, fn: () => void) => fn()),
    },
    propagation: {
      extract: vi.fn((_ctx: unknown, _headers: unknown) => 'extracted-ctx'),
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { OK: 1, ERROR: 2 },
    __mockSpan: mockSpan,
    __mockTracer: mockTracer,
  }
})

import { expressMiddleware, fastifyPlugin } from '../middleware'
import { trace, SpanStatusCode } from '@opentelemetry/api'

const getMockSpan = () => {
  const mod = vi.mocked(trace)
  return (mod.getTracer as any).mock.results[0]?.value?.startSpan?.mock?.results[0]?.value
    ?? { setAttribute: vi.fn(), setStatus: vi.fn(), end: vi.fn() }
}

describe('expressMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a middleware function', () => {
    const mw = expressMiddleware()
    expect(typeof mw).toBe('function')
  })

  it('creates a server span with HTTP attributes', () => {
    const mw = expressMiddleware()
    const req = {
      method: 'GET',
      url: '/api/test',
      path: '/api/test',
      protocol: 'https',
      headers: { 'user-agent': 'test-agent' },
    }
    const res = {
      end: vi.fn(),
      statusCode: 200,
    }
    const next = vi.fn()

    mw(req, res, next)

    expect(trace.getTracer).toHaveBeenCalledWith('nirikshaai.http')
    expect(next).toHaveBeenCalled()
  })

  it('records HTTP status code and ends span on res.end (2xx)', () => {
    const mw = expressMiddleware()
    const mockSpan = { setAttribute: vi.fn(), setStatus: vi.fn(), end: vi.fn() }
    vi.mocked(trace.getTracer).mockReturnValue({ startSpan: vi.fn(() => mockSpan) } as any)

    const originalEnd = vi.fn()
    const req = {
      method: 'GET',
      url: '/test',
      path: '/test',
      headers: {},
    }
    const res = {
      end: originalEnd,
      statusCode: 200,
    }
    const next = vi.fn()

    mw(req, res, next)
    // Call the patched end
    res.end()

    expect(mockSpan.setAttribute).toHaveBeenCalledWith('http.status_code', 200)
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK })
    expect(mockSpan.end).toHaveBeenCalled()
    expect(originalEnd).toHaveBeenCalled()
  })

  it('sets error status for 5xx responses', () => {
    const mw = expressMiddleware()
    const mockSpan = { setAttribute: vi.fn(), setStatus: vi.fn(), end: vi.fn() }
    vi.mocked(trace.getTracer).mockReturnValue({ startSpan: vi.fn(() => mockSpan) } as any)

    const req = { method: 'POST', url: '/crash', path: '/crash', headers: {} }
    const res = { end: vi.fn(), statusCode: 503 }
    const next = vi.fn()

    mw(req, res, next)
    res.end()

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'HTTP 503',
    })
  })

  it('handles missing path gracefully', () => {
    const mw = expressMiddleware()
    vi.mocked(trace.getTracer).mockReturnValue({
      startSpan: vi.fn(() => ({ setAttribute: vi.fn(), setStatus: vi.fn(), end: vi.fn() })),
    } as any)

    const req = { method: 'GET', url: '/fallback', headers: {} }
    const res = { end: vi.fn(), statusCode: 200 }
    const next = vi.fn()

    expect(() => mw(req, res, next)).not.toThrow()
  })
})

describe('fastifyPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers onRequest, onResponse, and onError hooks', async () => {
    const hooks: Record<string, Function> = {}
    const fastify = {
      addHook: vi.fn((name: string, fn: Function) => { hooks[name] = fn }),
    }

    await fastifyPlugin(fastify, {})

    expect(fastify.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function))
    expect(fastify.addHook).toHaveBeenCalledWith('onResponse', expect.any(Function))
    expect(fastify.addHook).toHaveBeenCalledWith('onError', expect.any(Function))
  })

  it('onRequest creates a span and attaches it to request', async () => {
    const mockSpan = { setAttribute: vi.fn(), setStatus: vi.fn(), end: vi.fn() }
    vi.mocked(trace.getTracer).mockReturnValue({ startSpan: vi.fn(() => mockSpan) } as any)

    const hooks: Record<string, Function> = {}
    const fastify = {
      addHook: vi.fn((name: string, fn: Function) => { hooks[name] = fn }),
    }

    await fastifyPlugin(fastify, {})

    const request: any = {
      method: 'GET',
      url: '/api',
      headers: { 'user-agent': 'jest' },
      protocol: 'https',
    }

    await hooks['onRequest'](request, {})

    expect(request.nirikshaSpan).toBe(mockSpan)
    expect(request.nirikshaCtx).toBeDefined()
  })

  it('onResponse sets status and ends span', async () => {
    const mockSpan = { setAttribute: vi.fn(), setStatus: vi.fn(), end: vi.fn() }
    vi.mocked(trace.getTracer).mockReturnValue({ startSpan: vi.fn(() => mockSpan) } as any)

    const hooks: Record<string, Function> = {}
    const fastify = {
      addHook: vi.fn((name: string, fn: Function) => { hooks[name] = fn }),
    }

    await fastifyPlugin(fastify, {})

    const request: any = { method: 'GET', url: '/', headers: {} }
    await hooks['onRequest'](request, {})
    await hooks['onResponse'](request, { statusCode: 200 })

    expect(mockSpan.setAttribute).toHaveBeenCalledWith('http.status_code', 200)
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK })
    expect(mockSpan.end).toHaveBeenCalled()
  })

  it('onResponse handles 5xx with error status', async () => {
    const mockSpan = { setAttribute: vi.fn(), setStatus: vi.fn(), end: vi.fn() }
    vi.mocked(trace.getTracer).mockReturnValue({ startSpan: vi.fn(() => mockSpan) } as any)

    const hooks: Record<string, Function> = {}
    const fastify = {
      addHook: vi.fn((name: string, fn: Function) => { hooks[name] = fn }),
    }

    await fastifyPlugin(fastify, {})

    const request: any = { method: 'GET', url: '/', headers: {} }
    await hooks['onRequest'](request, {})
    await hooks['onResponse'](request, { statusCode: 500 })

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'HTTP 500',
    })
  })

  it('onResponse does nothing when no span attached', async () => {
    const hooks: Record<string, Function> = {}
    const fastify = {
      addHook: vi.fn((name: string, fn: Function) => { hooks[name] = fn }),
    }

    await fastifyPlugin(fastify, {})

    const request: any = {}
    // Should not throw
    await expect(hooks['onResponse'](request, { statusCode: 200 })).resolves.toBeUndefined()
  })

  it('onError records exception and sets error status', async () => {
    const mockSpan = { setAttribute: vi.fn(), setStatus: vi.fn(), end: vi.fn(), recordException: vi.fn() }
    vi.mocked(trace.getTracer).mockReturnValue({ startSpan: vi.fn(() => mockSpan) } as any)

    const hooks: Record<string, Function> = {}
    const fastify = {
      addHook: vi.fn((name: string, fn: Function) => { hooks[name] = fn }),
    }

    await fastifyPlugin(fastify, {})

    const request: any = { method: 'GET', url: '/', headers: {} }
    await hooks['onRequest'](request, {})

    const err = new Error('Something broke')
    await hooks['onError'](request, {}, err)

    expect(mockSpan.recordException).toHaveBeenCalledWith(err)
    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'Something broke',
    })
  })

  it('onError does nothing when no span attached', async () => {
    const hooks: Record<string, Function> = {}
    const fastify = {
      addHook: vi.fn((name: string, fn: Function) => { hooks[name] = fn }),
    }

    await fastifyPlugin(fastify, {})

    const request: any = {}
    await expect(hooks['onError'](request, {}, new Error('x'))).resolves.toBeUndefined()
  })
})
