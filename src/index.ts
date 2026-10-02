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
 *     otlpEndpoint: 'grpc-ingest.niriksha.ai:443',
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

import { logger } from './internal/logger'
export { submitEval, submitEvalsBatch } from './eval'
export { getPrompt, listPrompts, clearPromptCache } from './prompt'
export { observe, span, log, toAttributes } from './observe'
export type { SpanType, ObserveOptions, SpanOptions, LogLevel } from './observe'
export { recordConversation, recordRagChunk, recordToolCall } from './span'
export type { RAGChunk, ToolCall } from './span'
export { redactPii } from './pii'
export {
  guardCheck,
  guardCheckTool,
  guardCheckBatch,
  guardConfigured,
  safeText,
  localSecretFindings,
  GuardBlocked,
  GuardError,
} from './guard'
export type {
  GuardVerdict,
  GuardFinding,
  GuardAction,
  GuardFailMode,
  GuardCheckOptions,
  GuardBatchItem,
  GuardBatchResult,
} from './guard'
export { setBaggageContext, getBaggage } from './baggage'
export { withFlush } from './serverless'
export { expressMiddleware, fastifyPlugin } from './middleware'

const SDK_VERSION = '0.0.1' // keep in sync with package.json
const SDK_LANGUAGE = 'javascript'

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
// @opentelemetry/resources 2.x: Resource is a type; construct via factory.
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import type { SpanExporter } from '@opentelemetry/sdk-trace-base'
import type { MetricReader } from '@opentelemetry/sdk-metrics'
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs'
import { _configureGuard, type GuardFailMode } from './guard'

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
   *   SaaS example:          "grpc-ingest.niriksha.ai:443"
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
  /**
   * Head-based trace sampling rate (0.0–1.0). Default: 1.0 (sample all traces).
   * Use 0.1 to sample ~10% of traces. Requires @opentelemetry/sdk-trace-base.
   */
  sampleRate?: number
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
  /**
   * Base URL of the guard endpoint — the OTLP gateway's HTTP listener, e.g.
   * "https://ingest.niriksha.ai". The guard lives on the gateway, not the REST
   * API, so in SaaS these are different hosts. Derived from otlpEndpoint when
   * set and from endpoint when not; see deriveGuardUrl.
   */
  guardEndpoint?: string
  /**
   * What the guard does when it cannot reach the server:
   *   'open'           (default) allow the text through
   *   'closed'         block everything
   *   'secrets_closed' allow everything except locally-detectable credentials
   * Every fall-back logs a warning and increments guard.fail_open — it is never
   * silent.
   */
  guardFailOpen?: GuardFailMode
  /**
   * Default mode sent with every guard call: 'monitor' to observe what would be
   * blocked without enforcing, or 'block'. Note that 'monitor' cannot lift a
   * block your org's AIDR policy mandates.
   */
  guardMode?: 'monitor' | 'block'
}

/** The gateway's OTLP gRPC port and its HTTP port, where /v1/guard lives. */
const OTLP_GRPC_PORT = '4317'
const OTLP_HTTP_PORT = '4318'

/**
 * Best-effort guard base URL, so the common cases need no extra option.
 *
 * The guard endpoint is served by the OTLP gateway, not the REST API, and in SaaS
 * those are different hosts — so `endpoint` alone is not the answer.
 *
 * When `otlpEndpoint` is given it names the gateway, which is the right host;
 * only its port and scheme need translating. The gateway's gRPC listener is 4317
 * and its HTTP listener 4318, so a default deployment maps cleanly. A non-default
 * port (443 behind an ingress, say) is kept as configured, because guessing would
 * be worse than reusing what the caller already set.
 *
 * With no `otlpEndpoint` — the single-host Private Cloud layout — the REST base is
 * also the gateway, so it is used unchanged.
 *
 * Pass `guardEndpoint` explicitly for anything this does not cover; getting it
 * wrong shows up as a guard that logs "unreachable" on every call, which is loud
 * but only after the fact.
 */
export function deriveGuardUrl(base: string, otlpEndpoint?: string): string {
  if (!otlpEndpoint) return base

  let host = otlpEndpoint
  let scheme = 'https'
  const schemeSplit = host.indexOf('://')
  if (schemeSplit >= 0) {
    scheme = host.slice(0, schemeSplit)
    host = host.slice(schemeSplit + 3)
  }

  const portSplit = host.lastIndexOf(':')
  if (portSplit > 0) {
    const hostname = host.slice(0, portSplit)
    let port = host.slice(portSplit + 1)
    if (port === OTLP_GRPC_PORT) {
      port = OTLP_HTTP_PORT
      // A bare gRPC port means a direct, usually in-cluster gateway, which is
      // typically plaintext. TLS-terminated deployments set 443 and are left
      // alone by the branch above.
      scheme = 'http'
    }
    return `${scheme}://${hostname}:${port}`
  }

  return `${scheme}://${host}`
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
    sampleRate = 1.0,
    otlpPort = 4317,
    otlpEndpoint,
    insecure = false,
    tlsSkipVerify = false,
    caCertFile,
    guardEndpoint,
    guardFailOpen = 'open',
    guardMode,
  } = options

  _state.baseUrl = endpoint.replace(/\/$/, '')
  _state.apiKey = apiKey
  _configureGuard(
    guardEndpoint ? guardEndpoint.replace(/\/$/, '') : deriveGuardUrl(_state.baseUrl, otlpEndpoint),
    apiKey,
    guardFailOpen,
    guardMode,
  )

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

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    // Keep the classic key the Niriksha backend indexes on (the semconv
    // constant moved to incubating as deployment.environment.name).
    'deployment.environment': environment,
    'telemetry.sdk.name': 'nirikshaai-node',
    'telemetry.sdk.version': SDK_VERSION,
    'telemetry.sdk.language': SDK_LANGUAGE,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exporterOpts: any = { url: grpcEndpoint, metadata: headers, ...(channelCreds ? { credentials: channelCreds } : {}) }

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

  const sampler = buildSampler(sampleRate)
  if (sampler) sdkOptions.sampler = sampler

  const sdk = new NodeSDK(sdkOptions)
  sdk.start()

  // Install a diagnostic logger that surfaces quota-exceeded errors at
  // console.error level. The OTEL SDK only logs export failures at WARN/DEBUG
  // via the diag API, making them invisible in most production log setups.
  try {
    const { diag, DiagLogLevel } = require('@opentelemetry/api') as typeof import('@opentelemetry/api')
    const prev = diag
    diag.setLogger({
      error(msg: string, ...args: unknown[]) { prev.error(msg, ...args) },
      warn(msg: string, ...args: unknown[]) {
        if (msg.includes('ResourceExhausted') && msg.includes('data limit reached')) {
          logger.error('ERROR: org data quota exceeded — telemetry is being dropped. Contact your platform admin to increase the quota.')
        }
        prev.warn(msg, ...args)
      },
      info(msg: string, ...args: unknown[]) { prev.info(msg, ...args) },
      debug(msg: string, ...args: unknown[]) { prev.debug(msg, ...args) },
      verbose(msg: string, ...args: unknown[]) { prev.verbose(msg, ...args) },
    }, DiagLogLevel.WARN)
  } catch { /* @opentelemetry/api not available — skip */ }

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
    // sdk-logs 0.221: BatchLogRecordProcessor takes an options object.
    return new BatchLogRecordProcessor({ exporter })
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

/**
 * LLM, agent-framework and vector-store instrumentations, applied only when
 * `enableLLM: true`.
 *
 * Each entry lists one or more candidate packages; the first that resolves
 * wins, so listing both the official OTel package and the Traceloop one never
 * double-instruments the same library. Every package and exported class name
 * here has been verified to exist on npm — `@opentelemetry/instrumentation-
 * anthropic` and `-langchain`, previously listed, do not exist at all, so
 * Anthropic and LangChain tracing could never have worked.
 *
 * None of these are declared as dependencies: the user installs the ones they
 * need, and anything absent is skipped.
 */
export const LLM_INSTRUMENTATION_CANDIDATES: InstrumentationCandidate[] = [
    // Model providers
    { pkgs: ['@opentelemetry/instrumentation-openai', '@traceloop/instrumentation-openai'], cls: 'OpenAIInstrumentation' },
    { pkgs: ['@traceloop/instrumentation-anthropic'],  cls: 'AnthropicInstrumentation' },
    { pkgs: ['@traceloop/instrumentation-bedrock'],    cls: 'BedrockInstrumentation' },
    { pkgs: ['@traceloop/instrumentation-vertexai'],   cls: 'VertexAIInstrumentation' },
    { pkgs: ['@traceloop/instrumentation-azure'],      cls: 'AzureOpenAIInstrumentation' },
    { pkgs: ['@traceloop/instrumentation-cohere'],     cls: 'CohereInstrumentation' },
    { pkgs: ['@traceloop/instrumentation-together'],   cls: 'TogetherInstrumentation' },
    // Agent / orchestration frameworks
    { pkgs: ['@traceloop/instrumentation-langchain'],  cls: 'LangChainInstrumentation' },
    { pkgs: ['@traceloop/instrumentation-llamaindex'], cls: 'LlamaIndexInstrumentation' },
    { pkgs: ['@traceloop/instrumentation-mcp'],        cls: 'McpInstrumentation' },
    // Vector stores
    { pkgs: ['@traceloop/instrumentation-chromadb'],   cls: 'ChromaDBInstrumentation' },
    { pkgs: ['@traceloop/instrumentation-pinecone'],   cls: 'PineconeInstrumentation' },
    { pkgs: ['@traceloop/instrumentation-qdrant'],     cls: 'QdrantInstrumentation' },
]

function loadLLMInstrumentations(capturePrompts: boolean) {
  return loadInstrumentations(LLM_INSTRUMENTATION_CANDIDATES, capturePrompts)
}

export interface InstrumentationCandidate {
  /** Candidate package names, tried in order; the first that resolves is used. */
  pkgs: string[]
  /** Expected exported class name. Resolution falls back to scanning exports. */
  cls: string
}

/** True when require() failed because the package is simply not installed. */
function isModuleNotFound(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'MODULE_NOT_FOUND'
}

/**
 * Resolve the instrumentation class from a module.
 *
 * Falls back to scanning exports for anything named `*Instrumentation` so a
 * renamed or newly added export does not silently disable the integration —
 * the failure mode is invisible, since a missing class simply produced no spans.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveInstrumentationClass(mod: any, cls: string): any {
  if (mod?.[cls]) return mod[cls]
  if (typeof mod?.default === 'function') return mod.default
  for (const key of Object.keys(mod ?? {})) {
    if (key.endsWith('Instrumentation') && typeof mod[key] === 'function') return mod[key]
  }
  return undefined
}

function loadInstrumentations(
  candidates: (InstrumentationCandidate | { pkg: string; cls: string })[],
  capturePrompts: boolean,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any[] = []

  for (const candidate of candidates) {
    const pkgs = 'pkgs' in candidate ? candidate.pkgs : [candidate.pkg]
    const cls = candidate.cls

    for (const pkg of pkgs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let mod: any
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        mod = require(pkg)
      } catch (err) {
        // Not installed is the normal case. Anything else is a real problem and
        // must not be silent, or a broken instrumentation looks like an absent one.
        if (!isModuleNotFound(err)) {
          logger.warn(`failed to load ${pkg}: ${(err as Error).message}`)
        }
        continue
      }

      const InstrCls = resolveInstrumentationClass(mod, cls)
      if (!InstrCls) {
        logger.warn(`${pkg} is installed but exports no instrumentation class`)
        break
      }

      try {
        // captureContent is not accepted by every instrumentation. Retry without
        // it rather than dropping the integration for the whole library.
        result.push(capturePrompts ? new InstrCls({ captureContent: true }) : new InstrCls({}))
      } catch (err) {
        if (capturePrompts) {
          try {
            result.push(new InstrCls({}))
          } catch (inner) {
            logger.warn(`failed to construct ${pkg}: ${(inner as Error).message}`)
          }
        } else {
          logger.warn(`failed to construct ${pkg}: ${(err as Error).message}`)
        }
      }
      break // first resolving package wins — never double-instrument
    }
  }

  return result
}

function buildSampler(rate: number) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TraceIdRatioBasedSampler, ParentBasedSampler, AlwaysOnSampler, AlwaysOffSampler } =
      require('@opentelemetry/sdk-trace-base') as typeof import('@opentelemetry/sdk-trace-base')
    if (rate >= 1.0) return new AlwaysOnSampler()
    if (rate <= 0.0) return new AlwaysOffSampler()
    return new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(rate) })
  } catch {
    return undefined
  }
}
