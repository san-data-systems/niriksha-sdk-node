import { _state } from './index'
import { logger } from './internal/logger'

export interface EvalInput {
  traceId: string
  metricName: string
  score: number
  label?: string
  explanation?: string
  evalType?: 'rule_based' | 'llm_judge' | 'human'
  experimentId?: string        // groups evals into an experiment
  confidence?: number          // evaluator confidence [0,1]
  metadata?: Record<string, string>  // arbitrary context
  evalTime?: string            // ISO 8601; omit = server uses now()
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const MAX_ATTEMPTS = 3
  let lastErr: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      logger.debug(`eval retry attempt ${attempt}`)
      await sleep((attempt - 1) * 500)
    }

    // AbortSignal.timeout() — no timer leak
    const signal = AbortSignal.timeout(timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal })
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        // success or client error — don't retry
        return res
      }
      lastErr = new Error(`HTTP ${res.status}`)
      // 5xx — fall through to retry
    } catch (err) {
      lastErr = err
      // network error or abort — fall through to retry
    }
  }

  logger.warn('eval request failed after all retries:', lastErr)
  throw lastErr
}

/** Submit a single evaluation result for a trace. */
export async function submitEval(input: EvalInput): Promise<{ id?: string; error?: string }> {
  const {
    traceId, metricName, score, label, explanation, evalType = 'rule_based',
    experimentId, confidence, metadata, evalTime,
  } = input

  const body: Record<string, unknown> = {
    trace_id: traceId,
    metric_name: metricName,
    score,
    eval_type: evalType,
  }
  if (label !== undefined) body.label = label
  if (explanation !== undefined) body.explanation = explanation
  if (experimentId !== undefined) body.experiment_id = experimentId
  if (confidence !== undefined) body.confidence = confidence
  if (metadata !== undefined) body.metadata = metadata
  if (evalTime !== undefined) body.eval_time = evalTime

  try {
    const res = await fetchWithRetry(
      `${_state.baseUrl}/api/v1/sdk/evals`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': _state.apiKey },
        body: JSON.stringify(body),
      },
      15_000,
    )
    return res.ok ? res.json() : { error: `HTTP ${res.status}` }
  } catch (err) {
    return { error: String(err) }
  }
}

/** Submit multiple eval results in one request. */
export async function submitEvalsBatch(
  evals: EvalInput[],
): Promise<{ inserted?: number; error?: string }> {
  const mapped = evals.map(e => {
    const item: Record<string, unknown> = {
      trace_id: e.traceId,
      metric_name: e.metricName,
      score: e.score,
      eval_type: e.evalType ?? 'rule_based',
    }
    if (e.label !== undefined) item.label = e.label
    if (e.explanation !== undefined) item.explanation = e.explanation
    if (e.experimentId !== undefined) item.experiment_id = e.experimentId
    if (e.confidence !== undefined) item.confidence = e.confidence
    if (e.metadata !== undefined) item.metadata = e.metadata
    if (e.evalTime !== undefined) item.eval_time = e.evalTime
    return item
  })

  try {
    const res = await fetchWithRetry(
      `${_state.baseUrl}/api/v1/sdk/evals/batch`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': _state.apiKey },
        body: JSON.stringify({ evals: mapped }),
      },
      15_000,
    )
    return res.ok ? res.json() : { error: `HTTP ${res.status}` }
  } catch (err) {
    return { error: String(err) }
  }
}
