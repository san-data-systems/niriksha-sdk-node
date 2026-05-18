# NestJS Orders Application — NirikshaAI SDK Example

This example shows the correct way to integrate NirikshaAI into a NestJS application. Because NestJS uses decorators and dependency injection that are resolved at module load time, `init()` is called at the very top of `src/main.ts` — before the `NestFactory.create()` call — so that `@opentelemetry/instrumentation-nestjs-core` can patch the framework internals before any module is instantiated. The `OrdersService` additionally uses the OTel tracer API directly to create child spans with domain-specific attributes.

## Prerequisites

- Node.js 18+
- A NirikshaAI account at [app.niriksha.ai](https://app.niriksha.ai)
- A project API key (prefix `nai_`) — create one under **Project → API Keys**

## Install

```bash
cd examples/nestjs
npm install
```

## Run

```bash
export NIRIKSHA_API_KEY=nai_your_key_here
npm start
```

The server starts on `http://localhost:3002`. You can test it with:

```bash
curl http://localhost:3002/orders
curl -X POST http://localhost:3002/orders \
  -H 'Content-Type: application/json' \
  -d '{"customerId":"cust_42","items":["sku-1","sku-2"],"total":79.98}'
```

## What you'll see in NirikshaAI

Each request produces a trace with a root HTTP span from the NestJS instrumentation and nested child spans from `OrdersService` (`OrdersService.findOne`, `OrdersService.create`). Custom attributes on the service-layer spans (`order.customer_id`, `order.item_count`, `order.total`) are fully indexed and filterable in the NirikshaAI trace explorer.
