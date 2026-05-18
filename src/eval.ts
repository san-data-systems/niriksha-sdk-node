import { _state } from './index'

export interface EvalInput {
  traceId: string
  metricName: string
  score: number
  label?: string
  explanation?: string
  evalType?: 'rule_based' | 'llm_judge' | 'human'
}

/** Submit a single evaluation result for a trace. */
export async function submitEval(input: EvalInput): Promise<{ id?: string; error?: string }> {
  const { traceId, metricName, score, label, explanation, evalType = 'rule_based' } = input
  const body: Record<string, unknown> = { trace_id: traceId, metric_name: metricName, score, eval_type: evalType }
  if (label) body.label = label
  if (explanation) body.explanation = explanation

  try {
    const res = await fetch(`${_state.baseUrl}/api/v1/sdk/evals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': _state.apiKey },
      body: JSON.stringify(body),
    })
    return res.ok ? res.json() : { error: `HTTP ${res.status}` }
  } catch (err) {
    return { error: String(err) }
  }
}

/** Submit multiple eval results in one request. */
export async function submitEvalsBatch(
  evals: EvalInput[],
): Promise<{ inserted?: number; error?: string }> {
  const mapped = evals.map(e => ({
    trace_id: e.traceId,
    metric_name: e.metricName,
    score: e.score,
    label: e.label,
    explanation: e.explanation,
    eval_type: e.evalType ?? 'rule_based',
  }))
  try {
    const res = await fetch(`${_state.baseUrl}/api/v1/sdk/evals/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': _state.apiKey },
      body: JSON.stringify({ evals: mapped }),
    })
    return res.ok ? res.json() : { error: `HTTP ${res.status}` }
  } catch (err) {
    return { error: String(err) }
  }
}
