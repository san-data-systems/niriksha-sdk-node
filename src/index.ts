/**
 * NirikshaAI Node.js / TypeScript SDK
 * ====================================
 * Full-stack observability for any Node.js service — traces, metrics, and logs
 * via OpenTelemetry.
 *
 * SaaS quick start:
 *
 *   import { init } from '@nirikshaai/sdk'
 *   init({
 *     endpoint: 'https://app.niriksha.ai',
 *     otlpEndpoint: 'ingest.niriksha.ai:4317',
 *     apiKey: 'nai_...',
 *   })
 *
 * Private Cloud — TLS with trusted certificate:
 *
 *   init({ endpoint: 'https://niriksha.internal', otlpEndpoint: 'niriksha.internal:4317', apiKey: 'nai_...' })
 *
 * Private Cloud — self-signed / custom CA:
 *
 *   init({ ..., caCertFile: '/etc/ssl/niriksha-ca.crt' })
 *
 * Private Cloud — skip TLS verification (dev/staging only):
 *
 *   init({ ..., tlsSkipVerify: true })
 *
 * Private Cloud — plaintext gRPC (TLS terminated at ingress):
 *
 *   init({ ..., insecure: true })
 *
 * LLM auto-instrumentation (OpenAI, Anthropic, LangChain) is available but opt-in:
 *
 *   init({ ..., enableLLM: true })
 */

export { submitEval, submitEvalsBatch } from './eval'
export { getPrompt, listPrompts, clearPromptCache } from './prompt'
export { recordConversation, recordRagChunk, recordToolCall } from './span'
export type { RAGChunk, ToolCall } from './span'
export { redactPii } from './pii'
export { setBaggageContext, getBaggage } from './baggage'
export { withFlush } from './serverless'

const SDK_VERSION = '0.2.0' // keep in sync with package.json
const SDK_LANGUAGE = 'javascript'

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import { Resource } from '@opentelemetry/resources'
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions'
import type { SpanExporter } from '@opentelemetry/sdk-trace-base'
import type { MetricReader } from '@opentelemetry/sdk-metrics'
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs'

/** Internal state shared with eval and prompt modules */
export const _state = {
  baseUrl: '',
  apiKey: '',
}

export interface InitOptions {
  /**
   * NirikshaAI REST/control-plane base URL.
   *   SaaS:          "https://app.niriksha.ai"
   *   Private Cloud: "https://niriksha.internal"
   */
  endpoint: string
  /**
   * Override the gRPC OTLP address (host:port, no scheme).
   * Use when REST API and OTLP gateway are on different hosts.
   *   SaaS example:          "ingest.niriksha.ai:4317"
   *   Private Cloud example: "niriksha.internal:4317"
   * If omitted the SDK derives the address from endpoint's hostname + otlpPort.
   */
  otlpEndpoint?: string
  /** Project-scoped API key (prefix nai_). Encodes your org+project — no IDs needed. */
  apiKey: string
  /** service.name resource attribute (default: "my-service") */
  serviceName?: string
  /** deployment.environment resource attribute (default: "production") */
  environment?: string
  /** Export OTLP metrics (default: true). */
  enableMetrics?: boolean
  /** Export OTLP logs (default: true). */
  enableLogs?: boolean
  /**
   * Auto-instrument LLM libraries: OpenAI, Anthropic, LangChain, VertexAI.
   * Default: false — opt-in to keep startup fast for non-AI services.
   */
  enableLLM?: boolean
  /**
   * Capture llm.input/output.messages when enableLLM=true.
   * Keep false in production unless you have PII controls.
   */
  capturePrompts?: boolean
  /** OTLP gRPC port (default 4317). Ignored when otlpEndpoint is set explicitly. */
  otlpPort?: number
  /**
   * Send gRPC traffic without TLS. Use when TLS is terminated at an ingress
   * in front of the NirikshaAI gateway (common in private cloud deployments).
   */
  insecure?: boolean
  /**
   * Use TLS but skip server certificate validation.
   * Dev/staging only — do NOT use in production.
   */
  tlsSkipVerify?: boolean
  /**
   * Path to a PEM-encoded CA certificate for verifying the gateway's TLS cert.
   * Use for private CAs. Mutually exclusive with tlsSkipVerify and insecure.
   */
  caCertFile?: string
}

let _initialized = false

/**
 * Initialise NirikshaAI telemetry for this Node.js process.
 * Call this once at startup before any other code.
 */
export function init(options: InitOptions): void {
  if (_initialized) return

  const {
    endpoint,
    apiKey,
    serviceName = 'my-service',
    environment = 'production',
    enableMetrics = true,
    enableLogs = true,
    enableLLM = false,
    capturePrompts = false,
    otlpPort = 4317,
    otlpEndpoint,
    insecure = false,
    tlsSkipVerify = false,
    caCertFile,
  } = options

  _state.baseUrl = endpoint.replace(/\/$/, '')
  _state.apiKey = apiKey

  const useTLS = endpoint.startsWith('https')
  const useInsecure = insecure || !useTLS

  // Resolve gRPC address
  const host = endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const resolvedGrpcAddr = otlpEndpoint ?? `${host}:${otlpPort}`
  const grpcEndpoint = `${useInsecure ? 'grpc' : 'grpcs'}://${resolvedGrpcAddr}`

  const headers = buildGrpcMetadata({ 'x-api-key': apiKey })
  const channelCreds = buildChannelCredentials({ useInsecure, tlsSkipVerify, caCertFile })

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NodeSDK } = require('@opentelemetry/sdk-node') as typeof import('@opentelemetry/sdk-node')

  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: serviceName,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
    'telemetry.sdk.name': 'nirikshaai-node',
    'telemetry.sdk.version': SDK_VERSION,
    'telemetry.sdk.language': SDK_LANGUAGE,
  })

  const exporterOpts = { url: grpcEndpoint, metadata: headers, ...(channelCreds ? { credentials: channelCreds } : {}) }

  const traceExporter: SpanExporter = new OTLPTraceExporter(exporterOpts)
  const metricReader: MetricReader | undefined = enableMetrics ? buildMetricReader(exporterOpts) : undefined
  const logProcessor: LogRecordProcessor | undefined = enableLogs ? buildLogProcessor(exporterOpts) : undefined

  const instrumentations = [
    ...loadGeneralInstrumentations(),
    ...(enableLLM ? loadLLMInstrumentations(capturePrompts) : []),
  ]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdkOptions: any = { traceExporter, resource, instrumentations }
  if (metricReader) sdkOptions.metricReader = metricReader
  if (logProcessor) sdkOptions.logRecordProcessor = logProcessor

  const sdk = new NodeSDK(sdkOptions)
  sdk.start()

  process.on('SIGTERM', () => sdk.shutdown().finally(() => process.exit(0)))
  process.on('SIGINT',  () => sdk.shutdown().finally(() => process.exit(0)))

  _initialized = true
}

/**
 * Force-flush all pending spans, metrics, and log records.
 * Call before process exit in serverless / short-lived environments.
 */
export async function flush(): Promise<void> {
  const { trace, metrics } = await import('@opentelemetry/api')
  const tp = trace.getTracerProvider() as any
  if (typeof tp?.forceFlush === 'function') await tp.forceFlush()
  const mp = metrics.getMeterProvider() as any
  if (typeof mp?.forceFlush === 'function') await mp.forceFlush()
}

export function isInitialized(): boolean {
  return _initialized
}

function buildChannelCredentials(opts: {
  useInsecure: boolean
  tlsSkipVerify: boolean
  caCertFile?: string
}) {
  if (opts.useInsecure) return undefined
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const grpc = require('@grpc/grpc-js') as typeof import('@grpc/grpc-js')
    if (opts.tlsSkipVerify) {
      return grpc.credentials.createSsl(null, null, null, {
        checkServerIdentity: () => undefined,
      })
    }
    if (opts.caCertFile) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs')
      const rootCerts = fs.readFileSync(opts.caCertFile)
      return grpc.credentials.createSsl(rootCerts)
    }
    return undefined // system roots via grpcs:// scheme
  } catch {
    return undefined
  }
}

function buildGrpcMetadata(h: Record<string, string>) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Metadata } = require('@grpc/grpc-js') as typeof import('@grpc/grpc-js')
    const md = new Metadata()
    for (const [k, v] of Object.entries(h)) md.set(k, v)
    return md
  } catch {
    return h
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildMetricReader(exporterOpts: any): MetricReader | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-grpc') as
      typeof import('@opentelemetry/exporter-metrics-otlp-grpc')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics') as
      typeof import('@opentelemetry/sdk-metrics')
    const exporter = new OTLPMetricExporter(exporterOpts)
    return new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 })
  } catch {
    return undefined
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildLogProcessor(exporterOpts: any): LogRecordProcessor | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-grpc') as
      typeof import('@opentelemetry/exporter-logs-otlp-grpc')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs') as
      typeof import('@opentelemetry/sdk-logs')
    const exporter = new OTLPLogExporter(exporterOpts)
    return new BatchLogRecordProcessor(exporter)
  } catch {
    return undefined
  }
}

function loadGeneralInstrumentations() {
  const candidates = [
    { pkg: '@opentelemetry/instrumentation-http',      cls: 'HttpInstrumentation' },
    { pkg: '@opentelemetry/instrumentation-express',   cls: 'ExpressInstrumentation' },
    { pkg: '@opentelemetry/instrumentation-fastify',   cls: 'FastifyInstrumentation' },
    { pkg: '@opentelemetry/instrumentation-nestjs-core', cls: 'NestInstrumentation' },
    { pkg: '@opentelemetry/instrumentation-pg',        cls: 'PgInstrumentation' },
    { pkg: '@opentelemetry/instrumentation-mysql',     cls: 'MySQLInstrumentation' },
    { pkg: '@opentelemetry/instrumentation-mongodb',   cls: 'MongoDBInstrumentation' },
    { pkg: '@opentelemetry/instrumentation-redis',     cls: 'RedisInstrumentation' },
    { pkg: '@opentelemetry/instrumentation-ioredis',   cls: 'IORedisInstrumentation' },
    { pkg: '@opentelemetry/instrumentation-graphql',   cls: 'GraphQLInstrumentation' },
    { pkg: '@opentelemetry/instrumentation-grpc',      cls: 'GrpcInstrumentation' },
  ]
  return loadInstrumentations(candidates, false)
}

function loadLLMInstrumentations(capturePrompts: boolean) {
  const candidates = [
    { pkg: '@opentelemetry/instrumentation-openai',    cls: 'OpenAIInstrumentation' },
    { pkg: '@opentelemetry/instrumentation-anthropic', cls: 'AnthropicInstrumentation' },
    { pkg: '@opentelemetry/instrumentation-langchain', cls: 'LangChainInstrumentation' },
    { pkg: '@traceloop/instrumentation-vertexai',      cls: 'VertexAIInstrumentation' },
  ]
  return loadInstrumentations(candidates, capturePrompts)
}

function loadInstrumentations(
  candidates: { pkg: string; cls: string }[],
  capturePrompts: boolean,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any[] = []
  for (const { pkg, cls } of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(pkg)
      const InstrCls = mod[cls] ?? mod.default
      if (InstrCls) {
        const opts = capturePrompts ? { captureContent: true } : {}
        result.push(new InstrCls(opts))
      }
    } catch {
      // Library not installed — skip
    }
  }
  return result
}
