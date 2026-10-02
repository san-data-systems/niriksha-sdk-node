import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { trace, SpanStatusCode } from '@opentelemetry/api'
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { context } from '@opentelemetry/api'

import { observe, span, log, toAttributes } from '../observe'

const exporter = new InMemorySpanExporter()

beforeAll(() => {
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })
  trace.setGlobalTracerProvider(provider)
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
})
beforeEach(() => exporter.reset())

const byName = () => Object.fromEntries(exporter.getFinishedSpans().map(s => [s.name, s]))

describe('observe / span / log', () => {
  it('makes a run with typed children and a log event, using GenAI attributes', async () => {
    const out = await observe('research-agent', async () => {
      log('info', 'started', { q: 'x' })
      const plan = await span('plan', () => 'p', { type: 'llm', model: 'gpt-4o' })
      const docs = await span('search', () => ['d'], { type: 'tool' })
      return `${plan}:${docs.length}`
    })
    expect(out).toBe('p:1')
    const s = byName()
    expect(s['research-agent'].parentSpanContext).toBeUndefined()
    expect(s['research-agent'].attributes['niriksha.run']).toBe(true)
    expect(s['research-agent'].attributes['gen_ai.operation.name']).toBe('invoke_agent')
    expect(s['research-agent'].attributes['gen_ai.agent.name']).toBe('research-agent')
    expect(s['research-agent'].status.code).toBe(SpanStatusCode.OK)
    expect(s['research-agent'].events.map(e => e.name)).toEqual(['started'])
    expect(s['plan'].parentSpanContext?.spanId).toBe(s['research-agent'].spanContext().spanId)
    expect(s['plan'].attributes['gen_ai.operation.name']).toBe('chat')
    expect(s['plan'].attributes['gen_ai.request.model']).toBe('gpt-4o')
    expect(s['search'].attributes['gen_ai.operation.name']).toBe('execute_tool')
    expect(s['search'].attributes['gen_ai.tool.name']).toBe('search')
  })

  it('records a thrown error on the span and re-throws', async () => {
    await expect(observe('failing', async () => { throw new Error('boom') })).rejects.toThrow('boom')
    const s = byName()
    expect(s['failing'].status.code).toBe(SpanStatusCode.ERROR)
    expect(s['failing'].events.some(e => e.name === 'exception')).toBe(true)
  })

  it('coerces attributes: objects to JSON, nulls dropped, primitive arrays kept', () => {
    expect(toAttributes({ cfg: { k: 1 }, tags: ['a', 'b'], n: null, u: undefined, ok: true })).toEqual({ cfg: '{"k":1}', tags: ['a', 'b'], ok: true })
  })
})
