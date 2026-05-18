# OpenAI Chat Completion with Evals — NirikshaAI SDK Example

This example shows how to instrument an OpenAI chat completion call with NirikshaAI and submit a programmatic evaluation result back to the platform. The SDK is initialised with `enableLLM: true`, which activates `@opentelemetry/instrumentation-openai` to automatically capture model, token counts, and finish reason on every OpenAI API call. After the completion, the script retrieves the `traceId` from the active span and calls `submitEval()` to attach a `response_quality` score to that trace — making it visible in the NirikshaAI **Evals** dashboard alongside the full LLM trace.

## Prerequisites

- Node.js 18+
- An OpenAI API key
- A NirikshaAI account at [app.niriksha.ai](https://app.niriksha.ai)
- A project API key (prefix `nai_`) — create one under **Project → API Keys**

## Install

```bash
cd examples/llm-openai
npm install
```

## Run

```bash
export NIRIKSHA_API_KEY=nai_your_key_here
export OPENAI_API_KEY=sk-...
npm start
# Optionally pass a custom prompt:
npx ts-node --require ./src/instrumentation.ts src/index.ts "What is a span in OpenTelemetry?"
```

To also capture prompt and completion text in NirikshaAI (useful for debugging; disable in production if handling PII):

```bash
CAPTURE_PROMPTS=true npm start
```

## What you'll see in NirikshaAI

The trace appears in **GenAI → Traces** with automatic attributes for model name, token usage, and finish reason. The `response_quality` eval score is visible in **GenAI → Evals**, linked directly to the trace, so you can correlate quality regressions with specific prompt changes or model versions over time.
