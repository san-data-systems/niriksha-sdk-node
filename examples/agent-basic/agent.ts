/**
 * A small agent wrapped with observe / span / log.
 *
 * Run it against any NirikshaAI install and it shows up on LLM → Runs within a
 * few seconds, with a timeline, a repeated-tool finding (we call `search` four
 * times in a row on purpose) and one error.
 *
 *   NIRIKSHA_ENDPOINT=https://app.niriksha.ai NIRIKSHA_API_KEY=nai_... npx tsx agent.ts
 */
import { init, observe, span, log, flush } from '@nirikshaai/sdk'

init({
  endpoint: process.env.NIRIKSHA_ENDPOINT ?? 'http://localhost:8080',
  apiKey: process.env.NIRIKSHA_API_KEY ?? '',
  serviceName: 'example-research-agent',
  otlpEndpoint: process.env.NIRIKSHA_OTLP_ENDPOINT,
})

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function callModel(prompt: string): Promise<string> {
  await sleep(200)
  return `answer to: ${prompt.slice(0, 40)}`
}

async function search(query: string): Promise<string[]> {
  await sleep(100)
  if (Math.random() < 0.2) throw new Error('search backend timed out')
  return [`doc about ${query}`]
}

async function main() {
  const answer = await observe('research-agent', async () => {
    log('info', 'agent started', { question: 'Why is checkout slow?' })
    const plan = await span('plan', () => callModel('plan for: why is checkout slow?'), { type: 'llm', model: 'example-model' })
    const docs: string[] = []
    for (let i = 0; i < 4; i++) {
      // four consecutive calls → a possible_loop finding at the default threshold
      try {
        docs.push(...(await span('search', () => search(`${plan} #${i}`), { type: 'tool' })))
      } catch (err) {
        log('warn', 'search failed, continuing', { error: (err as Error).message })
      }
    }
    return span('answer', () => callModel(docs.join(' ')), { type: 'llm', model: 'example-model' })
  })
  console.log(answer)
  await flush()
}

main().catch(err => { console.error(err); process.exit(1) })
