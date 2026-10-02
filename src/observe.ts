/**
 * Wrap an agent so the platform sees it as a run.
 *
 * - `observe(name, fn)` wraps an agent entry point in a root span. The platform
 *   turns it into an **agent run**: it appears on LLM → Runs as soon as the
 *   first child span arrives, flips to Succeeded or Failed when this span ends,
 *   and the health rules (long running, repeated tool, repeated error, no
 *   activity, possible loop) evaluate it.
 * - `span(name, fn, { type })` is a unit of work inside the run — an LLM call,
 *   a tool call, a retrieval or a nested agent. `type` drives the timeline.
 * - `log(level, message, attrs)` is a structured line on the active run.
 *
 * Plain OpenTelemetry with the GenAI semantic conventions
 * (`gen_ai.operation.name`, `gen_ai.agent.name`, `gen_ai.tool.name`), so the
 * same spans read in any OTel backend. No LLM library is required.
 *
 * @example
 * import { init, observe, span, log } from '@nirikshaai/sdk'
 * init({ endpoint: 'https://app.niriksha.ai', apiKey: 'nai_…', serviceName: 'research-agent' })
 * await observe('research-agent', async () => {
 *   log('info', 'agent started', { question })
 *   const plan = await span('plan', () => callModel(question), { type: 'llm', model: 'gpt-4o' })
 *   const docs = await span('search', () => search(plan), { type: 'tool' })
 *   return span('answer', () => callModel(docs), { type: 'llm' })
 * })
 */
import { type Attributes, type AttributeValue, type Span as OTelSpan, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'

export type SpanType = 'llm' | 'tool' | 'agent' | 'retrieval'

const TRACER_NAME = 'nirikshaai.observe'
const OPERATION_FOR: Record<SpanType, string> = { llm: 'chat', tool: 'execute_tool', agent: 'invoke_agent', retrieval: 'retrieval' }
/** Marks the root span of a run so the platform never guesses from a missing parent alone. */
const RUN_ATTR = 'niriksha.run'

export interface ObserveOptions {
  /** Span type recorded on the run; default `agent`. */
  type?: SpanType
  /** Extra attributes on the root span. */
  attributes?: Record<string, unknown>
}

export interface SpanOptions {
  /** `llm` | `tool` (default) | `agent` | `retrieval`. */
  type?: SpanType
  /** For LLM spans: becomes `gen_ai.request.model`. */
  model?: string
  attributes?: Record<string, unknown>
}

/** Coerce arbitrary values to OTel attribute values; objects are JSON-encoded, null/undefined dropped. */
export function toAttributes(values?: Record<string, unknown>): Attributes {
  const out: Attributes = {}
  for (const [k, v] of Object.entries(values ?? {})) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v
    else if (Array.isArray(v) && v.every(x => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean')) out[k] = v as AttributeValue
    else out[k] = JSON.stringify(v)
  }
  return out
}

function finish(sp: OTelSpan, err?: unknown): void {
  if (err === undefined) {
    sp.setStatus({ code: SpanStatusCode.OK })
  } else {
    const e = err instanceof Error ? err : new Error(String(err))
    sp.recordException(e)
    sp.setStatus({ code: SpanStatusCode.ERROR, message: e.message })
  }
  sp.end()
}

function runIn<T>(name: string, attributes: Attributes, fn: (span: OTelSpan) => T | Promise<T>): Promise<T> {
  return trace.getTracer(TRACER_NAME).startActiveSpan(name, { kind: SpanKind.INTERNAL, attributes }, async (sp) => {
    try {
      const result = await fn(sp)
      finish(sp)
      return result
    } catch (err) {
      finish(sp, err)
      throw err
    }
  })
}

/** Wrap an agent entry point in a root span — the platform's run. */
export function observe<T>(name: string, fn: (span: OTelSpan) => T | Promise<T>, options: ObserveOptions = {}): Promise<T> {
  return runIn(name, {
    [RUN_ATTR]: true,
    'gen_ai.operation.name': OPERATION_FOR[options.type ?? 'agent'],
    'gen_ai.agent.name': name,
    ...toAttributes(options.attributes),
  }, fn)
}

/** A unit of work inside the run; exceptions are recorded and re-thrown. */
export function span<T>(name: string, fn: (span: OTelSpan) => T | Promise<T>, options: SpanOptions = {}): Promise<T> {
  const type = options.type ?? 'tool'
  const attrs: Attributes = { 'gen_ai.operation.name': OPERATION_FOR[type] }
  if (type === 'tool') attrs['gen_ai.tool.name'] = name
  if (type === 'agent') attrs['gen_ai.agent.name'] = name
  if (options.model) attrs['gen_ai.request.model'] = options.model
  return runIn(name, { ...attrs, ...toAttributes(options.attributes) }, fn)
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

/**
 * A structured log line attached to the active run: recorded as an event on
 * the active span (so the run page shows it even with log export off) and,
 * when the OTel logs API is installed, emitted as a log record with the trace
 * context.
 */
export function log(level: LogLevel, message: string, attributes?: Record<string, unknown>): void {
  const attrs = toAttributes(attributes)
  const sp = trace.getActiveSpan()
  if (sp?.isRecording()) sp.addEvent(message, { 'log.level': level, ...attrs })
  try {
    // Optional dependency: present when init() enabled logs.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { logs, SeverityNumber } = require('@opentelemetry/api-logs') as typeof import('@opentelemetry/api-logs')
    const sev: Record<LogLevel, number> = { trace: SeverityNumber.TRACE, debug: SeverityNumber.DEBUG, info: SeverityNumber.INFO, warn: SeverityNumber.WARN, error: SeverityNumber.ERROR, fatal: SeverityNumber.FATAL }
    logs.getLogger('nirikshaai.agent').emit({ body: message, severityNumber: sev[level], severityText: level.toUpperCase(), attributes: attrs })
  } catch {
    /* logs API not installed — the span event already carries the line */
  }
}
