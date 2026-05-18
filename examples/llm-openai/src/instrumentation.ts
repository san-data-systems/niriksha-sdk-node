/**
 * NirikshaAI instrumentation bootstrap with LLM auto-instrumentation enabled.
 * Must be the first module loaded — pass via --require to ts-node.
 */
import { init } from '@nirikshaai/sdk'

init({
  endpoint: 'https://app.niriksha.ai',
  otlpEndpoint: 'ingest.niriksha.ai:4317',
  apiKey: process.env.NIRIKSHA_API_KEY ?? 'nai_your_key_here',
  serviceName: 'chat-completion-demo',
  environment: process.env.NODE_ENV ?? 'production',
  enableLLM: true,
  capturePrompts: process.env.CAPTURE_PROMPTS === 'true',
})
