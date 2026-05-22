/**
 * Application entry point.
 * init() must be called before NestFactory.create() so that
 * NestJS module loading is covered by OpenTelemetry auto-instrumentation.
 */
import { init } from '@nirikshaai/sdk'

init({
  endpoint: 'https://app.niriksha.ai',
  otlpEndpoint: 'grpc-ingest.niriksha.ai:443',
  apiKey: process.env.NIRIKSHA_API_KEY ?? 'nai_your_key_here',
  serviceName: 'orders-nest',
  environment: process.env.NODE_ENV ?? 'production',
})

import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const port = Number(process.env.PORT ?? 3002)
  await app.listen(port)
  console.log(`orders-nest listening on http://localhost:${port}`)
}

bootstrap()
