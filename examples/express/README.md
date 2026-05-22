# Express Orders API — NirikshaAI SDK Example

This example shows how to instrument an Express.js REST API with NirikshaAI. The `instrumentation.ts` file initialises the SDK via `--require` so that OpenTelemetry is bootstrapped before any application code runs — this is the correct pattern for Express and ensures all inbound HTTP spans, database calls, and custom attributes are captured automatically and forwarded to `grpc-ingest.niriksha.ai:443`.

## Prerequisites

- Node.js 18+
- A NirikshaAI account at [app.niriksha.ai](https://app.niriksha.ai)
- A project API key (prefix `nai_`) — create one under **Project → API Keys**

## Install

```bash
cd examples/express
npm install
```

## Run

```bash
export NIRIKSHA_API_KEY=nai_your_key_here
npm start
```

The server starts on `http://localhost:3000`. You can test it with:

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -d '{"item":"widget","qty":3}'
```

## What you'll see in NirikshaAI

Within seconds, traces appear in the **Traces** view with spans for every HTTP request. The `GET /orders/:id` and `POST /orders` handlers enrich the active span with custom attributes (`order.id`, `order.item`, `order.status`) which are searchable in NirikshaAI's trace explorer. Metrics (request rate, latency histograms) populate the **Metrics** dashboards automatically.
