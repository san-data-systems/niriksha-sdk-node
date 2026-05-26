import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the index module to control _state
vi.mock('../index', () => ({
  _state: {
    baseUrl: 'https://test.niriksha.ai',
    apiKey: 'test-key-123',
  },
  flush: vi.fn(),
  withFlush: vi.fn(),
}))

// Mock internal logger
vi.mock('../internal/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { submitEval, submitEvalsBatch } from '../eval'

describe('submitEval', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('submits an eval and returns response on success', async () => {
    const mockResponse = { id: 'eval-123' }
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    )

    const result = await submitEval({
      traceId: 'trace-1',
      metricName: 'accuracy',
      score: 0.95,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://test.niriksha.ai/api/v1/sdk/evals')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toMatchObject({
      trace_id: 'trace-1',
      metric_name: 'accuracy',
      score: 0.95,
      eval_type: 'rule_based',
    })
    expect(result).toEqual(mockResponse)
  })

  it('includes optional fields when provided', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    )

    await submitEval({
      traceId: 'trace-2',
      metricName: 'quality',
      score: 0.8,
      label: 'good',
      explanation: 'looks correct',
      evalType: 'llm_judge',
      experimentId: 'exp-1',
      confidence: 0.9,
      metadata: { model: 'gpt-4' },
      evalTime: '2026-01-01T00:00:00Z',
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(body.label).toBe('good')
    expect(body.explanation).toBe('looks correct')
    expect(body.eval_type).toBe('llm_judge')
    expect(body.experiment_id).toBe('exp-1')
    expect(body.confidence).toBe(0.9)
    expect(body.metadata).toEqual({ model: 'gpt-4' })
    expect(body.eval_time).toBe('2026-01-01T00:00:00Z')
  })

  it('returns error on HTTP 4xx without retry', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Not Found', { status: 404 }),
    )

    const result = await submitEval({
      traceId: 'trace-3',
      metricName: 'test',
      score: 0.5,
    })

    expect(result).toEqual({ error: 'HTTP 404' })
  })

  it('returns error object on network failure after retries', async () => {
    const networkError = new Error('Network error')
    vi.spyOn(global, 'fetch').mockRejectedValue(networkError)

    // Advance timers to skip retry delays
    const promise = submitEval({ traceId: 't', metricName: 'm', score: 0.5 })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.error).toContain('Error')
  })

  it('retries on 5xx and eventually succeeds', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'eval-ok' }), { status: 200 }))

    const promise = submitEval({ traceId: 't', metricName: 'm', score: 1.0 })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ id: 'eval-ok' })
  })
})

describe('submitEvalsBatch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('submits batch evals and returns result', async () => {
    const mockResponse = { inserted: 2 }
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    )

    const result = await submitEvalsBatch([
      { traceId: 't1', metricName: 'accuracy', score: 0.9 },
      { traceId: 't2', metricName: 'accuracy', score: 0.8 },
    ])

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://test.niriksha.ai/api/v1/sdk/evals/batch')
    const body = JSON.parse(init?.body as string)
    expect(body.evals).toHaveLength(2)
    expect(body.evals[0]).toMatchObject({ trace_id: 't1', score: 0.9 })
    expect(result).toEqual(mockResponse)
  })

  it('maps optional fields in batch items', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ inserted: 1 }), { status: 200 }),
    )

    await submitEvalsBatch([{
      traceId: 't1',
      metricName: 'm',
      score: 0.7,
      label: 'pass',
      explanation: 'ok',
      evalType: 'human',
      experimentId: 'exp-2',
      confidence: 0.85,
      metadata: { reviewer: 'alice' },
      evalTime: '2026-05-01T00:00:00Z',
    }])

    const fetchMock = vi.mocked(fetch)
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(body.evals[0]).toMatchObject({
      label: 'pass',
      explanation: 'ok',
      eval_type: 'human',
      experiment_id: 'exp-2',
    })
  })

  it('returns error on HTTP failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('', { status: 500 }),
    )

    const promise = submitEvalsBatch([{ traceId: 't', metricName: 'm', score: 0.5 }])
    await vi.runAllTimersAsync()
    const result = await promise

    // After all retries exhaust on 5xx, it returns error
    expect(result.error).toBeDefined()
  })

  it('returns error on network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'))

    const promise = submitEvalsBatch([{ traceId: 't', metricName: 'm', score: 0.5 }])
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.error).toContain('Error')
  })
})
