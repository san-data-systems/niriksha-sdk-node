import OpenAI from 'openai'
import { trace } from '@opentelemetry/api'
import { submitEval } from '@nirikshaai/sdk'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

async function runChatCompletion(userMessage: string): Promise<void> {
  const tracer = trace.getTracer('chat-completion-demo')

  await tracer.startActiveSpan('chat.completion', async (span) => {
    try {
      span.setAttribute('llm.request.model', 'gpt-4o-mini')
      span.setAttribute('llm.request.message', userMessage)

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Be concise.' },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 256,
      })

      const reply = response.choices[0]?.message?.content ?? ''
      const inputTokens = response.usage?.prompt_tokens ?? 0
      const outputTokens = response.usage?.completion_tokens ?? 0

      span.setAttribute('llm.response.model', response.model)
      span.setAttribute('llm.usage.input_tokens', inputTokens)
      span.setAttribute('llm.usage.output_tokens', outputTokens)
      span.setAttribute('llm.finish_reason', response.choices[0]?.finish_reason ?? '')

      console.log('Reply:', reply)
      console.log(`Tokens — input: ${inputTokens}, output: ${outputTokens}`)

      // Retrieve the trace ID for eval linkage
      const ctx = span.spanContext()
      const traceId = ctx.traceId

      // Simple heuristic eval: penalise very short responses
      const score = reply.length > 20 ? 1.0 : 0.5
      const evalResult = await submitEval({
        traceId,
        metricName: 'response_quality',
        score,
        label: score === 1.0 ? 'pass' : 'too_short',
        explanation: `Response length: ${reply.length} chars`,
        evalType: 'rule_based',
      })

      if (evalResult.error) {
        console.warn('Eval submission failed:', evalResult.error)
      } else {
        console.log('Eval submitted, id:', evalResult.id)
      }
    } finally {
      span.end()
    }
  })
}

const message = process.argv[2] ?? 'Explain OpenTelemetry in one sentence.'
runChatCompletion(message).catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
