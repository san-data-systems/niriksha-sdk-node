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

import { getPrompt, listPrompts, clearPromptCache } from '../prompt'

describe('getPrompt', () => {
  beforeEach(() => {
    clearPromptCache()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('fetches and returns prompt content', async () => {
    const mockData = {
      data: { content: 'Hello, {{name}}!', tags: ['greeting'], created_at: '2026-01-01T00:00:00Z' },
    }
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), { status: 200 }),
    )

    const content = await getPrompt('greeting-prompt')

    expect(content).toBe('Hello, {{name}}!')
  })

  it('posts to correct endpoint with name and variables', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { content: 'Hi!' } }), { status: 200 }),
    )

    await getPrompt('test-prompt', { variables: { user: 'Alice' } })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://test.niriksha.ai/api/v1/sdk/prompts/render')
    expect(init?.method).toBe('POST')
    const body = JSON.parse(init?.body as string)
    expect(body.name).toBe('test-prompt')
    expect(body.variables).toEqual({ user: 'Alice' })
  })

  it('includes version when specified', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { content: 'v2 content' } }), { status: 200 }),
    )

    await getPrompt('versioned-prompt', { version: 2 })

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(body.version).toBe(2)
  })

  it('caches response and does not re-fetch on second call', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { content: 'cached content' } }), { status: 200 }),
    )

    const first = await getPrompt('cache-test')
    const second = await getPrompt('cache-test')

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(first).toBe('cached content')
    expect(second).toBe('cached content')
  })

  it('re-fetches after cache TTL expires', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { content: 'v1' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { content: 'v2' } }), { status: 200 }))

    const first = await getPrompt('ttl-test')
    // Advance past 5-minute cache TTL
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000)
    const second = await getPrompt('ttl-test')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(first).toBe('v1')
    expect(second).toBe('v2')
  })

  it('throws on HTTP error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Not Found', { status: 404 }),
    )

    await expect(getPrompt('missing-prompt')).rejects.toThrow('HTTP 404')
  })

  it('handles missing data fields gracefully', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: {} }), { status: 200 }),
    )

    const content = await getPrompt('empty-prompt')
    expect(content).toBe('')
  })
})

describe('listPrompts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('fetches and returns list of prompts', async () => {
    const mockData = {
      data: {
        prompts: [
          { id: '1', name: 'greeting', description: 'A greeting prompt' },
          { id: '2', name: 'summary', description: 'A summary prompt' },
        ],
      },
    }
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), { status: 200 }),
    )

    const prompts = await listPrompts()

    expect(prompts).toHaveLength(2)
    expect(prompts[0].name).toBe('greeting')
    expect(prompts[1].name).toBe('summary')
  })

  it('calls correct endpoint with API key', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { prompts: [] } }), { status: 200 }),
    )

    await listPrompts()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://test.niriksha.ai/api/v1/sdk/prompts')
    expect((init?.headers as Record<string, string>)?.['X-API-Key']).toBe('test-key-123')
  })

  it('returns empty array when no prompts', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: {} }), { status: 200 }),
    )

    const prompts = await listPrompts()
    expect(prompts).toEqual([])
  })

  it('throws on HTTP error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    )

    await expect(listPrompts()).rejects.toThrow('HTTP 401')
  })
})

describe('clearPromptCache', () => {
  it('clears the cache so the next call re-fetches', async () => {
    clearPromptCache()
    vi.useFakeTimers()

    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { content: 'first' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { content: 'second' } }), { status: 200 }))

    await getPrompt('clear-test')
    clearPromptCache()
    const result = await getPrompt('clear-test')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result).toBe('second')

    vi.useRealTimers()
  })
})
