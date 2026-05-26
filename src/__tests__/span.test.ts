import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Span } from '@opentelemetry/api'

// Create stable mock span and tracer objects
const mockSpan = {
  setAttribute: vi.fn(),
  addEvent: vi.fn(),
  recordException: vi.fn(),
  setStatus: vi.fn(),
  end: vi.fn(),
}

// Mock @opentelemetry/api before importing span module
vi.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan: vi.fn<[], Span | undefined>(() => mockSpan as unknown as Span),
  },
  SpanStatusCode: { OK: 1, ERROR: 2 },
}))

import { recordConversation, recordRagChunk, recordToolCall } from '../span'
import { trace } from '@opentelemetry/api'

describe('recordConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as unknown as Span)
  })

  it('sets conversation id attribute', () => {
    recordConversation('conv-123')
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('llm.conversation.id', 'conv-123')
  })

  it('sets session id when provided', () => {
    recordConversation('conv-123', 'sess-456')
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('llm.session.id', 'sess-456')
  })

  it('sets turn index when provided', () => {
    recordConversation('conv-123', 'sess-456', 3)
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('llm.turn.index', 3)
  })

  it('does not set session id when not provided', () => {
    recordConversation('conv-123')
    const calls = mockSpan.setAttribute.mock.calls.map((c) => c[0])
    expect(calls).not.toContain('llm.session.id')
    expect(calls).not.toContain('llm.turn.index')
  })

  it('does nothing when no active span', () => {
    vi.mocked(trace.getActiveSpan).mockReturnValue(undefined)
    expect(() => recordConversation('conv-123')).not.toThrow()
  })
})

describe('recordRagChunk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as unknown as Span)
  })

  it('adds rag.chunk.retrieved event with required attributes', () => {
    recordRagChunk({ chunkId: 'c1', source: 'docs', score: 0.95 })

    expect(mockSpan.addEvent).toHaveBeenCalledWith(
      'rag.chunk.retrieved',
      expect.objectContaining({
        'rag.chunk.id': 'c1',
        'rag.source': 'docs',
        'rag.chunk.score': 0.95,
      }),
    )
  })

  it('includes content when provided', () => {
    recordRagChunk({ chunkId: 'c2', source: 'wiki', score: 0.8, content: 'some text' })

    expect(mockSpan.addEvent).toHaveBeenCalledWith(
      'rag.chunk.retrieved',
      expect.objectContaining({ 'rag.chunk.content': 'some text' }),
    )
  })

  it('does not include content when not provided', () => {
    recordRagChunk({ chunkId: 'c3', source: 'db', score: 0.7 })

    const eventAttrs = mockSpan.addEvent.mock.calls[0][1] as Record<string, unknown>
    expect(eventAttrs).not.toHaveProperty('rag.chunk.content')
  })

  it('does nothing when no active span', () => {
    vi.mocked(trace.getActiveSpan).mockReturnValue(undefined)
    expect(() => recordRagChunk({ chunkId: 'c4', source: 'x', score: 0.5 })).not.toThrow()
  })
})

describe('recordToolCall', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as unknown as Span)
  })

  it('adds llm.tool.call event with required attributes', () => {
    recordToolCall({ toolName: 'search', callId: 'call-1' })

    expect(mockSpan.addEvent).toHaveBeenCalledWith(
      'llm.tool.call',
      expect.objectContaining({
        'llm.tool.name': 'search',
        'llm.tool.call_id': 'call-1',
      }),
    )
  })

  it('includes input and output when provided', () => {
    recordToolCall({
      toolName: 'calculator',
      callId: 'call-2',
      input: '{"x": 1}',
      output: '{"result": 2}',
    })

    expect(mockSpan.addEvent).toHaveBeenCalledWith(
      'llm.tool.call',
      expect.objectContaining({
        'llm.tool.input': '{"x": 1}',
        'llm.tool.output': '{"result": 2}',
      }),
    )
  })

  it('does not include input/output when not provided', () => {
    recordToolCall({ toolName: 'tool', callId: 'c' })

    const eventAttrs = mockSpan.addEvent.mock.calls[0][1] as Record<string, unknown>
    expect(eventAttrs).not.toHaveProperty('llm.tool.input')
    expect(eventAttrs).not.toHaveProperty('llm.tool.output')
  })

  it('does nothing when no active span', () => {
    vi.mocked(trace.getActiveSpan).mockReturnValue(undefined)
    expect(() => recordToolCall({ toolName: 't', callId: 'c' })).not.toThrow()
  })
})
