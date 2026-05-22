# @nirikshaai/sdk

[![npm version](https://img.shields.io/npm/v/@nirikshaai/sdk.svg)](https://www.npmjs.com/package/@nirikshaai/sdk)
[![Node.js versions](https://img.shields.io/node/v/@nirikshaai/sdk.svg)](https://www.npmjs.com/package/@nirikshaai/sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/npm/l/@nirikshaai/sdk.svg)](https://github.com/san-data-systems/sdk-node/blob/main/LICENSE)

The official Node.js / TypeScript SDK for [NirikshaAI](https://nirikshaai.com) — AI-native observability for logs, metrics, traces, and LLM/agent telemetry.

Under the hood this is a thin wrapper around the [OpenTelemetry Node.js SDK](https://opentelemetry.io/docs/languages/js/). It configures OTLP exporters, wires up auto-instrumentation, and exposes NirikshaAI-specific helpers (evals, prompt management). You can use the standard `@opentelemetry/api` at any time alongside it.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [LLM Applications](#llm-applications)
- [Configuration Reference](#configuration-reference)
- [Auto-Instrumented Libraries](#auto-instrumented-libraries)
- [Custom Spans and Metrics](#custom-spans-and-metrics)
- [Express.js Example](#expressjs-example)
- [Eval Submission](#eval-submission)
- [Prompt Management](#prompt-management)
- [CommonJS Support](#commonjs-support)
- [Environment Variables](#environment-variables)

---

## Installation

```bash
npm install @nirikshaai/sdk
# Required peer dependencies
npm install @opentelemetry/api @opentelemetry/sdk-node
```

Or with Yarn:

```bash
yarn add @nirikshaai/sdk @opentelemetry/api @opentelemetry/sdk-node
```

**Minimum Node.js version:** 18.x

---

## Quick Start

> **Important:** Call `init()` before importing or requiring any instrumented libraries. OTEL instrumentation works by patching modules at load time, so it must run first.

```typescript
// instrumentation.ts  ← import this file FIRST (e.g. via --require flag)
import { init } from '@nirikshaai/sdk'

init({
  endpoint: 'https://app.niriksha.ai',
  otlpEndpoint: 'grpc-ingest.niriksha.ai:4317', // SaaS: OTLP gateway is separate from the REST API
  apiKey: 'nai_...',
  serviceName: 'my-service',
})
```

Start your application with the instrumentation file loaded first:

```bash
# ts-node
ts-node --require ./instrumentation.ts src/index.ts

# compiled JS
node --require ./dist/instrumentation.js dist/index.js
```

Your `apiKey` is a project-scoped key (prefixed `nai_`). It encodes which org and project your telemetry belongs to — you do not need to pass org or project IDs separately.

---

## LLM Applications

Enable LLM instrumentation with the `enableLLM` flag. When set, the SDK automatically patches supported LLM client libraries so that every API call creates a standard OpenTelemetry span with token counts, model name, and (optionally) prompt/completion content.

```typescript
import { init } from '@nirikshaai/sdk'

init({
  endpoint: 'https://app.niriksha.ai',
  apiKey: 'nai_...',
  serviceName: 'my-ai-service',
  enableLLM: true,       // Auto-instruments OpenAI, Anthropic, LangChain, etc.
  capturePrompts: false, // Set true only if PII controls are in place
})

// Import AFTER init()
import OpenAI from 'openai'

const client = new OpenAI()

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Summarise this document.' }],
})
// A LLM span is emitted automatically — no extra code needed
```

> **Privacy note:** `capturePrompts: false` is the default. Setting it to `true` will capture the full text of prompts and completions as span attributes (`llm.input.messages` / `llm.output.messages`). Only enable this if you have appropriate data governance and PII controls in place.

---

## Configuration Reference

All options are passed to `init()`.

| Option | Type | Default | Description |
|---|---|---|---|
| `endpoint` | `string` | *(required)* | NirikshaAI REST/control-plane base URL. SaaS: `https://app.niriksha.ai`. Private Cloud: `https://niriksha.internal` |
| `otlpEndpoint` | `string` | `undefined` | Override the gRPC OTLP address (`host:port`, no scheme). SaaS: `grpc-ingest.niriksha.ai:4317`. Derived from `endpoint` if omitted. |
| `apiKey` | `string` | *(required)* | Project-scoped API key with `nai_` prefix |
| `serviceName` | `string` | `"my-service"` | Value of the `service.name` OTEL resource attribute |
| `environment` | `string` | `"production"` | Value of the `deployment.environment` OTEL resource attribute |
| `enableMetrics` | `boolean` | `true` | Export OTLP metrics on a 60-second periodic interval |
| `enableLogs` | `boolean` | `true` | Export OTLP logs |
| `enableLLM` | `boolean` | `false` | Auto-instrument supported LLM client libraries (opt-in) |
| `capturePrompts` | `boolean` | `false` | Capture `llm.input/output.messages` span attributes (PII risk) |
| `otlpPort` | `number` | `4317` | OTLP gRPC port. Ignored when `otlpEndpoint` is set explicitly. |
| `insecure` | `boolean` | `false` | Send gRPC without TLS. Use when TLS is terminated at an ingress. |
| `tlsSkipVerify` | `boolean` | `false` | Use TLS but skip server certificate validation. Dev/staging only. |
| `caCertFile` | `string` | `undefined` | Path to a PEM CA certificate for verifying the gateway TLS cert. |

### Private Cloud examples

```typescript
// TLS with system/custom CA
init({ endpoint: 'https://niriksha.internal', otlpEndpoint: 'niriksha.internal:4317', apiKey: 'nai_...' })

// Self-signed / custom CA
init({ ..., caCertFile: '/etc/ssl/niriksha-ca.crt' })

// Skip TLS verification (dev/staging only)
init({ ..., tlsSkipVerify: true })

// Plaintext gRPC (TLS terminated at ingress)
init({ ..., insecure: true })
```

---

## Auto-Instrumented Libraries

### General (always enabled when the package is installed)

| Package | What's captured |
|---|---|
| `@opentelemetry/instrumentation-http` | All inbound and outbound HTTP/HTTPS requests, method, URL, status code |
| `@opentelemetry/instrumentation-express` | Express.js route names, middleware timing, response codes |
| `@opentelemetry/instrumentation-fastify` | Fastify routes, hooks, response codes |
| `@opentelemetry/instrumentation-nestjs-core` | NestJS controller methods, guards, interceptors |
| `@opentelemetry/instrumentation-pg` | PostgreSQL query text (no values), timing |
| `@opentelemetry/instrumentation-mysql` | MySQL query text (no values), timing |
| `@opentelemetry/instrumentation-mongodb` | MongoDB operation type, collection, database |
| `@opentelemetry/instrumentation-redis` | Redis command name (values not captured) |
| `@opentelemetry/instrumentation-graphql` | GraphQL resolver names, operation type |
| `@opentelemetry/instrumentation-grpc` | gRPC server and client calls, method names, status codes |

### LLM (requires `enableLLM: true`)

| Package | What's captured |
|---|---|
| `@opentelemetry/instrumentation-openai` | Chat completions, embeddings, model name, token usage |
| `@opentelemetry/instrumentation-anthropic` | Messages API calls, model name, token usage |
| `@opentelemetry/instrumentation-langchain` | Chain invocations, individual tool call spans |
| `@traceloop/instrumentation-vertexai` | Vertex AI API calls, model name, token usage |

---

## Custom Spans and Metrics

`init()` configures the global OpenTelemetry providers. Use `@opentelemetry/api` directly for custom instrumentation:

```typescript
import { trace, metrics, SpanStatusCode } from '@opentelemetry/api'

const tracer = trace.getTracer('my-service')
const meter  = metrics.getMeter('my-service')

// --- Custom span ---
async function processPayment(orderId: string, amount: number) {
  const span = tracer.startSpan('process-payment')
  span.setAttribute('payment.order_id', orderId)
  span.setAttribute('payment.amount', amount)
  span.setAttribute('payment.currency', 'USD')

  try {
    const result = await chargeCard(orderId, amount)
    span.setAttribute('payment.transaction_id', result.transactionId)
    span.setStatus({ code: SpanStatusCode.OK })
    return result
  } catch (err) {
    span.recordException(err as Error)
    span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message })
    throw err
  } finally {
    span.end()
  }
}

// --- Custom counter ---
const orderCounter = meter.createCounter('orders.total', {
  description: 'Total number of orders processed',
  unit: '{order}',
})
orderCounter.add(1, { status: 'completed', region: 'us-east' })

// --- Custom histogram (latency, sizes) ---
const latencyHist = meter.createHistogram('order.processing.duration', {
  description: 'Time to process an order end-to-end',
  unit: 'ms',
})
latencyHist.record(142.5, { order_type: 'express' })

// --- Observable gauge (for values that are polled, not incremented) ---
const activeGauge = meter.createObservableGauge('queue.depth', {
  description: 'Number of messages waiting in the processing queue',
})
activeGauge.addCallback((result) => {
  result.observe(getQueueDepth(), { queue: 'orders' })
})
```

---

## Express.js Example

```typescript
// instrumentation.ts
import { init } from '@nirikshaai/sdk'

init({
  endpoint: 'https://app.niriksha.ai',
  apiKey: 'nai_...',
  serviceName: 'order-api',
  environment: 'production',
})
```

```typescript
// index.ts  (import instrumentation first via --require or top-level import)
import './instrumentation'
import express, { Request, Response } from 'express'
import { trace } from '@opentelemetry/api'

const app = express()
const tracer = trace.getTracer('order-api')

app.use(express.json())

app.get('/orders/:id', async (req: Request, res: Response) => {
  // Route is automatically traced by the Express instrumentation
  // Add custom attributes for richer observability:
  const span = trace.getActiveSpan()
  span?.setAttribute('order.id', req.params.id)

  const order = await db.getOrder(req.params.id)
  if (!order) {
    res.status(404).json({ error: 'not found' })
    return
  }
  res.json(order)
})

app.post('/orders', async (req: Request, res: Response) => {
  // Use a child span for the business logic
  const span = tracer.startSpan('create-order')
  try {
    const order = await createOrder(req.body)
    span.setAttribute('order.id', order.id)
    span.setAttribute('order.total', order.total)
    res.status(201).json(order)
  } finally {
    span.end()
  }
})

app.listen(3000)
```

---

## Eval Submission

Submit evaluation results for LLM responses. Evals are linked to a specific trace so results appear in the NirikshaAI LLM Traces view alongside the originating span.

### Single eval

```typescript
import { submitEval } from '@nirikshaai/sdk'

await submitEval({
  traceId: 'your-otel-trace-id',   // 32-character hex trace ID
  metricName: 'faithfulness',
  score: 0.92,                      // float in [0, 1]
  label: 'pass',                    // 'pass' | 'fail' | any custom label
  explanation: 'Response accurately reflects the source documents',
  evalType: 'llm_judge',            // 'llm_judge' | 'rule_based' | 'human'
})
```

### Batch eval

```typescript
import { submitEvalsBatch } from '@nirikshaai/sdk'

await submitEvalsBatch([
  {
    traceId: 'abc123...',
    metricName: 'toxicity',
    score: 0.01,
    label: 'pass',
    evalType: 'rule_based',
  },
  {
    traceId: 'abc123...',
    metricName: 'relevance',
    score: 0.88,
    label: 'pass',
    evalType: 'llm_judge',
    explanation: 'Response addresses the user question directly',
  },
])
```

### Obtaining the trace ID from an active span

```typescript
import { trace, context } from '@opentelemetry/api'

const tracer = trace.getTracer('my-service')
const span = tracer.startSpan('llm-call')

await context.with(trace.setSpan(context.active(), span), async () => {
  const response = await openaiClient.chat.completions.create({ ... })

  // Get trace ID for eval submission
  const spanCtx = span.spanContext()
  const traceId = spanCtx.traceId  // 32-character hex string

  const score = await runFaithfulnessJudge(response)
  await submitEval({
    traceId,
    metricName: 'faithfulness',
    score,
    label: score >= 0.8 ? 'pass' : 'fail',
    evalType: 'llm_judge',
  })
})

span.end()
```

---

## Prompt Management

Fetch versioned prompt templates from the NirikshaAI prompt vault. Variable substitution is performed server-side before the rendered text is returned.

### Fetch the latest deployed version

```typescript
import { getPrompt } from '@nirikshaai/sdk'

const prompt = await getPrompt('customer-support-system')
console.log(prompt.text)        // Rendered prompt text
console.log(prompt.version)     // Active version number
console.log(prompt.name)
```

### Fetch a specific version with variable substitution

```typescript
const prompt = await getPrompt('product-description', {
  version: 3,
  variables: {
    productName: 'Widget Pro',
    category: 'Electronics',
    price: '$49.99',
  },
})
console.log(prompt.text)  // All {{variables}} replaced server-side
```

### List all available prompts

```typescript
import { listPrompts } from '@nirikshaai/sdk'

const prompts = await listPrompts()
for (const p of prompts) {
  console.log(`${p.name} (v${p.version}) — ${p.description}`)
}
```

### Use a fetched prompt with OpenAI

```typescript
import { getPrompt } from '@nirikshaai/sdk'
import OpenAI from 'openai'

const client = new OpenAI()

async function generateProductDescription(productName: string, category: string) {
  const prompt = await getPrompt('product-description', {
    variables: { productName, category },
  })

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: prompt.text },
      { role: 'user', content: `Write a description for ${productName}` },
    ],
  })

  return response.choices[0].message.content
}
```

---

## CommonJS Support

The SDK ships with both ESM and CJS builds. CommonJS require works as expected:

```javascript
// CommonJS
const { init, submitEval, getPrompt, listPrompts } = require('@nirikshaai/sdk')

init({
  endpoint: 'http://localhost:4317',
  apiKey: 'nai_...',
  serviceName: 'my-service',
})

// Later in your code:
submitEval({
  traceId: '...',
  metricName: 'faithfulness',
  score: 0.95,
  label: 'pass',
}).catch(console.error)
```

---

## Environment Variables

You can configure the SDK through standard OpenTelemetry environment variables instead of (or in addition to) passing options to `init()`. Explicit options take precedence over environment variables.

| Variable | Equivalent `init()` option |
|---|---|
| `OTEL_SERVICE_NAME` | `serviceName` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Derived from `endpoint` + `otlpPort` |
| `OTEL_EXPORTER_OTLP_HEADERS` | Set to `X-API-Key=nai_your_key` |
| `OTEL_RESOURCE_ATTRIBUTES` | Use to set `deployment.environment` and other attributes |

Example:

```bash
export OTEL_SERVICE_NAME=my-service
export OTEL_EXPORTER_OTLP_ENDPOINT=http://your-nirikshaai:4317
export OTEL_EXPORTER_OTLP_HEADERS="X-API-Key=nai_your_key"
export OTEL_RESOURCE_ATTRIBUTES="deployment.environment=production"
```

Then call `init()` with no arguments:

```typescript
import { init } from '@nirikshaai/sdk'
init({} as any) // reads from environment
```

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
