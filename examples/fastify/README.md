# Fastify Product Catalog — NirikshaAI SDK Example

This example demonstrates instrumenting a Fastify application with NirikshaAI. The `instrumentation.ts` module is loaded first via `--require`, initialising the OpenTelemetry SDK before Fastify registers its routes — this guarantees that the `@opentelemetry/instrumentation-fastify` plugin captures every request lifecycle hook and enriches spans with Fastify-specific attributes like route patterns and reply status codes.

## Prerequisites

- Node.js 18+
- A NirikshaAI account at [app.niriksha.ai](https://app.niriksha.ai)
- A project API key (prefix `nai_`) — create one under **Project → API Keys**

## Install

```bash
cd examples/fastify
npm install
```

## Run

```bash
export NIRIKSHA_API_KEY=nai_your_key_here
npm start
```

The server starts on `http://localhost:3001`. You can test it with:

```bash
curl http://localhost:3001/health
curl "http://localhost:3001/products?inStock=true"
curl -X POST http://localhost:3001/products \
  -H 'Content-Type: application/json' \
  -d '{"name":"Super Widget","price":49.99}'
```

## What you'll see in NirikshaAI

Traces appear in the **Traces** explorer showing Fastify route spans alongside custom attributes (`products.returned`, `product.price`, `filter.inStock`). Fastify's structured JSON logs are forwarded as OTLP log records and are searchable in the **Logs** view correlated to their parent trace.
