/**
 * Framework middleware helpers for Express and Fastify.
 *
 * Express:
 *   app.use(nirikshaai.expressMiddleware())
 *
 * Fastify:
 *   await fastify.register(nirikshaai.fastifyPlugin)
 */
import { trace, context, propagation, SpanKind, SpanStatusCode } from '@opentelemetry/api'
import type { IncomingMessage, ServerResponse } from 'http'

const TRACER_NAME = 'nirikshaai.http'

/**
 * Express-compatible middleware that creates a server span for each request,
 * propagates the incoming trace context, and records the HTTP status code.
 *
 * Usage:
 *   app.use(expressMiddleware())
 */
export function expressMiddleware(): (req: any, res: any, next: () => void) => void {
  return function nirikshaMiddleware(req: any, res: any, next: () => void): void {
    // Extract incoming trace context from request headers
    const ctx = propagation.extract(context.active(), req.headers as Record<string, string | string[]>)

    const spanName = `${(req.method as string) ?? 'HTTP'} ${(req.path as string) ?? req.url ?? '/'}`
    const span = trace.getTracer(TRACER_NAME).startSpan(
      spanName,
      {
        kind: SpanKind.SERVER,
        attributes: {
          'http.method': req.method,
          'http.url': req.url,
          'http.target': req.path ?? req.url,
          'http.scheme': req.protocol ?? (req.connection?.encrypted ? 'https' : 'http'),
          'user_agent.original': req.headers?.['user-agent'],
        },
      },
      ctx,
    )

    // Intercept res.end to capture the status code and close the span
    const originalEnd = res.end.bind(res) as (...args: any[]) => any
    res.end = function patchedEnd(...args: any[]): any {
      const statusCode: number = res.statusCode ?? 0
      span.setAttribute('http.status_code', statusCode)
      if (statusCode >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${statusCode}` })
      } else {
        span.setStatus({ code: SpanStatusCode.OK })
      }
      span.end()
      return originalEnd(...args)
    }

    context.with(trace.setSpan(ctx, span), () => next())
  }
}

/**
 * Fastify plugin that adds `onRequest`, `onResponse`, and `onError` hooks to
 * create a server span per request, propagate context, and record status codes.
 *
 * Usage:
 *   await fastify.register(fastifyPlugin)
 */
export async function fastifyPlugin(fastify: any, _opts: any): Promise<void> {
  fastify.addHook('onRequest', async (request: any, _reply: any): Promise<void> => {
    const headers = request.headers as Record<string, string | string[]>
    const ctx = propagation.extract(context.active(), headers)

    const method: string = request.method ?? 'HTTP'
    const url: string = request.url ?? '/'
    const spanName = `${method} ${url}`

    const span = trace.getTracer(TRACER_NAME).startSpan(
      spanName,
      {
        kind: SpanKind.SERVER,
        attributes: {
          'http.method': method,
          'http.url': url,
          'http.target': url,
          'http.scheme': request.protocol ?? 'http',
          'user_agent.original': headers['user-agent'],
        },
      },
      ctx,
    )

    // Store the span on the request object for later hooks
    request.nirikshaSpan = span
    // Store the active context so onResponse can restore it if needed
    request.nirikshaCtx = trace.setSpan(ctx, span)
  })

  fastify.addHook('onResponse', async (request: any, reply: any): Promise<void> => {
    const span = request.nirikshaSpan
    if (!span) return

    const statusCode: number = reply.statusCode ?? 0
    span.setAttribute('http.status_code', statusCode)
    if (statusCode >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${statusCode}` })
    } else {
      span.setStatus({ code: SpanStatusCode.OK })
    }
    span.end()
  })

  fastify.addHook('onError', async (request: any, _reply: any, error: Error): Promise<void> => {
    const span = request.nirikshaSpan
    if (!span) return

    span.recordException(error)
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
  })
}

// Re-export http types used internally so consumers can reference them if needed
export type { IncomingMessage, ServerResponse }
