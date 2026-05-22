/**
 * NirikshaAI instrumentation bootstrap.
 * Must be the first module loaded — pass via --require to ts-node.
 */
import { init } from '@nirikshaai/sdk'

init({
  endpoint: 'https://app.niriksha.ai',
  otlpEndpoint: 'grpc-ingest.niriksha.ai:443',
  apiKey: process.env.NIRIKSHA_API_KEY ?? 'nai_your_key_here',
  serviceName: 'product-catalog',
  environment: process.env.NODE_ENV ?? 'production',
})
