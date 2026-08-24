/**
 * Inline AI security guard — check text *before* it reaches the model.
 *
 * The rest of this SDK is observability: it records what happened. This module is
 * enforcement. It calls the gateway's synchronous `/v1/guard` endpoint, which
 * returns a verdict in single-digit milliseconds, so a prompt injection can be
 * refused and a leaked credential stripped before the provider call is made.
 *
 * Three deliberate differences from how comparable SDKs behave, each because the
 * obvious choice is worse:
 *
 *  1. `redact` returns the rewritten text and resolves. Only `block` throws.
 *     Throwing on both means a customer who asked for PII stripping gets their
 *     application broken instead of their data protected.
 *
 *  2. Fail-open stays the default but stops being silent. A guard outage must not
 *     take down the caller's application, so an unreachable server allows the
 *     text through — but it warns and increments `guard.fail_open` every time. A
 *     silent fail-open is a security hole wearing a reliability costume: the
 *     control appears to work right up until it is needed.
 *
 *  3. `guardFailOpen: 'secrets_closed'` is available and is the mode a security
 *     buyer will actually accept. The secret patterns are embedded here, so when
 *     the server is unreachable, credential exfiltration is still blocked locally
 *     while everything else fails open.
 */

import { logger } from './internal/logger'

// ── verdict actions ─────────────────────────────────────────────────────────

export const ACTION_ALLOW = 'allow'
export const ACTION_TAG = 'tag'
export const ACTION_REDACT = 'redact'
export const ACTION_BLOCK = 'block'

export type GuardAction = 'allow' | 'tag' | 'redact' | 'block'

/**
 * What the guard does when it cannot reach the server.
 *
 *  - `open`           allow everything. Default.
 *  - `closed`         block everything. Correct for a hard compliance boundary,
 *                     and a guaranteed outage for everyone else.
 *  - `secrets_closed` allow everything except locally-detectable credentials.
 *                     The only fail mode that is both safe and survivable.
 */
export type GuardFailMode = 'open' | 'closed' | 'secrets_closed'

const FAIL_MODES: readonly GuardFailMode[] = ['open', 'closed', 'secrets_closed']

/**
 * Requests are bounded because this sits on the caller's critical path. A guard
 * that hangs is worse than one that is absent: the absent one fails fast.
 */
const TIMEOUT_MS = 3000

/** Mirrors the server's cap, so an oversized batch fails here with a clear
 * message rather than as a 400 from the gateway. */
const MAX_BATCH = 32

export interface GuardFinding {
  category?: string
  severity?: string
  rule?: string
  confidence?: number
  start?: number
  end?: number
  /** Set when the finding came from the SDK's local patterns rather than the server. */
  local?: boolean
}

export interface GuardVerdict {
  action: GuardAction
  findings: GuardFinding[]
  /** Low-precision detections recorded but not acted on. */
  reasons: string[]
  /** The rewritten text. Populated only when `action` is `redact`. */
  redacted: string
  riskScore: number
  riskSeverity: string
  /**
   * `project` when an operator's stored AIDR policy was applied, `default` when
   * the product default was. Only `project` is binding.
   */
  policySource: string
  /**
   * True when the block comes from the operator's policy rather than rule
   * precision alone — which also means monitor mode will not lift it.
   */
  policyEnforced: boolean
  /**
   * True when the guard was unreachable and the configured fail mode decided the
   * outcome. Never silently true: a warning is logged whenever it is set.
   */
  failedOpen: boolean
}

/** Base class for guard errors. */
export class GuardError extends Error {}

/**
 * Thrown when the guard's verdict is `block`.
 *
 * Carries the verdict, so a caller can log the reason or surface a message
 * without making a second guard call to find out what happened.
 *
 * Named for what happened, not for the fact that it is an error: "the guard
 * blocked this" is a decision by the guard, whereas `GuardBlockedError` reads as
 * a failure of it — a distinction that matters during an incident.
 */
export class GuardBlocked extends GuardError {
  readonly verdict: GuardVerdict

  constructor(verdict: GuardVerdict) {
    const rules = verdict.findings
      .map(f => f.rule)
      .filter(Boolean)
      .join(', ')
    super(`blocked by NirikshaAI guard: ${rules || 'policy'}`)
    this.name = 'GuardBlocked'
    this.verdict = verdict
  }
}

/**
 * Returns the text that is safe to send: the redaction when there was one, the
 * original otherwise.
 *
 * Exists so no caller has to write `verdict.redacted || original`, which is easy
 * to get wrong in the direction that forwards the secret. Also returns the
 * original when a malformed `redact` verdict carries no text, rather than
 * silently substituting an empty prompt.
 */
export function safeText(verdict: GuardVerdict, original: string): string {
  return verdict.action === ACTION_REDACT && verdict.redacted ? verdict.redacted : original
}

// ── module configuration, set by init() ────────────────────────────────────

export const _guardState = {
  url: '',
  apiKey: '',
  failMode: 'open' as GuardFailMode,
  mode: undefined as string | undefined,
}

export function _configureGuard(
  url: string,
  apiKey: string,
  failMode: GuardFailMode = 'open',
  mode?: string,
): void {
  if (!FAIL_MODES.includes(failMode)) {
    // Thrown at init rather than defaulted, so a deployment cannot believe it is
    // fail-closed when it is not.
    throw new GuardError(
      `NirikshaAI: guardFailOpen must be one of ${FAIL_MODES.join(', ')}, got ${String(failMode)}`,
    )
  }
  _guardState.url = url.replace(/\/$/, '')
  _guardState.apiKey = apiKey
  _guardState.failMode = failMode
  _guardState.mode = mode
}

/**
 * Whether the guard has a URL to call.
 *
 * Exported so a caller can branch, instead of discovering the guard is inert
 * only from a log line.
 */
export function guardConfigured(): boolean {
  return Boolean(_guardState.url && _guardState.apiKey)
}

// ── public API ─────────────────────────────────────────────────────────────

export interface GuardCheckOptions {
  /**
   * `input` for a prompt heading to the model, `output` for a completion coming
   * back. Injection and jailbreak rules apply to input only; secrets and PII to
   * both. Default: `input`.
   */
  direction?: 'input' | 'output'
  /** Throw {@link GuardBlocked} on a `block` verdict. Default: true. */
  throwOnBlock?: boolean
}

/** Evaluate one prompt or completion. */
export async function guardCheck(
  text: string,
  options: GuardCheckOptions = {},
): Promise<GuardVerdict> {
  const { direction = 'input', throwOnBlock = true } = options
  const verdict = await evaluate({ text, direction }, text)
  if (verdict.action === ACTION_BLOCK && throwOnBlock) throw new GuardBlocked(verdict)
  return verdict
}

/**
 * Evaluate a tool call before executing it.
 *
 * This is the check that can actually prevent an action — an `rm -rf`, an
 * unscoped `DELETE`, a credential read, an outbound request carrying a key.
 * Observing the tool call afterwards cannot.
 */
export async function guardCheckTool(
  name: string,
  args?: unknown,
  options: Pick<GuardCheckOptions, 'throwOnBlock'> = {},
): Promise<GuardVerdict> {
  const { throwOnBlock = true } = options
  const argsJson = args === undefined ? '' : typeof args === 'string' ? args : JSON.stringify(args)

  // The fallback text for the secrets-closed local check includes the arguments:
  // a credential passed to an outbound tool is the concrete exfiltration path,
  // so it is exactly what must still be inspected when the server is down.
  const verdict = await evaluate({ tool: { name, arguments: argsJson } }, `${name}\n${argsJson}`)
  if (verdict.action === ACTION_BLOCK && throwOnBlock) throw new GuardBlocked(verdict)
  return verdict
}

export interface GuardBatchItem {
  text: string
  direction?: 'input' | 'output'
}

export interface GuardBatchResult {
  /** The most severe verdict in the set: one blocked message means the
   * conversation must not be sent. */
  action: GuardAction
  verdicts: GuardVerdict[]
}

/**
 * Evaluate a whole message array in one request.
 *
 * A per-string API is an N+1 for a multi-turn conversation, which is every real
 * chat application.
 */
export async function guardCheckBatch(
  items: GuardBatchItem[],
  options: Pick<GuardCheckOptions, 'throwOnBlock'> = {},
): Promise<GuardBatchResult> {
  const { throwOnBlock = true } = options
  if (items.length === 0) {
    throw new GuardError('NirikshaAI: guardCheckBatch requires at least one item')
  }
  if (items.length > MAX_BATCH) {
    throw new GuardError(
      `NirikshaAI: guardCheckBatch accepts at most ${MAX_BATCH} items, got ${items.length}`,
    )
  }

  if (!guardConfigured()) {
    const verdicts = items.map(item => failVerdict(item.text))
    return { action: worstAction(verdicts), verdicts }
  }

  const payloadItems = items.map(item =>
    _guardState.mode ? { ...item, mode: _guardState.mode } : { ...item },
  )
  const body = await post(`${_guardState.url}/v1/guard/batch`, { items: payloadItems })
  if (!body) {
    const verdicts = items.map(item => failVerdict(item.text))
    return { action: worstAction(verdicts), verdicts }
  }

  const results = Array.isArray(body.results) ? body.results : []
  const verdicts = results.map(r => verdictFrom(r as Record<string, unknown>))
  const action = (body.action as GuardAction) || worstAction(verdicts)
  if (action === ACTION_BLOCK && throwOnBlock) {
    throw new GuardBlocked(
      verdicts.find(v => v.action === ACTION_BLOCK) ?? { ...emptyVerdict(), action: ACTION_BLOCK },
    )
  }
  return { action, verdicts }
}

// ── internals ──────────────────────────────────────────────────────────────

function emptyVerdict(): GuardVerdict {
  return {
    action: ACTION_ALLOW,
    findings: [],
    reasons: [],
    redacted: '',
    riskScore: 0,
    riskSeverity: '',
    policySource: '',
    policyEnforced: false,
    failedOpen: false,
  }
}

async function evaluate(
  payload: Record<string, unknown>,
  fallbackText: string,
): Promise<GuardVerdict> {
  if (!guardConfigured()) return failVerdict(fallbackText)
  const body = await post(`${_guardState.url}/v1/guard`, {
    ...payload,
    ...(_guardState.mode ? { mode: _guardState.mode } : {}),
  })
  if (!body) return failVerdict(fallbackText)
  return verdictFrom(body)
}

function verdictFrom(body: Record<string, unknown>): GuardVerdict {
  return {
    action: (body.action as GuardAction) || ACTION_ALLOW,
    findings: Array.isArray(body.findings) ? (body.findings as GuardFinding[]) : [],
    reasons: Array.isArray(body.reasons) ? (body.reasons as string[]) : [],
    redacted: typeof body.redacted === 'string' ? body.redacted : '',
    riskScore: typeof body.risk_score === 'number' ? body.risk_score : 0,
    riskSeverity: typeof body.risk_severity === 'string' ? body.risk_severity : '',
    policySource: typeof body.policy_source === 'string' ? body.policy_source : '',
    policyEnforced: body.policy_enforced === true,
    failedOpen: false,
  }
}

/**
 * POST to the guard. Resolves to null when the guard could not be consulted.
 *
 * Deliberately no retry. This is a synchronous call in front of the caller's LLM
 * request: retrying turns a 3-second timeout into a 9-second one, and the fail
 * mode is a better answer than a slower one.
 */
async function post(url: string, payload: unknown): Promise<Record<string, unknown> | null> {
  if (!/^https?:\/\//.test(url)) {
    logger.warn(`NirikshaAI guard: refusing non-http(s) URL ${url}`)
    return null
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': _guardState.apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      // 4xx is a client bug — a bad key, a malformed body — and means the guard
      // has never worked, rather than that it is briefly down. Worth more noise.
      const message = `NirikshaAI guard: ${url} returned ${res.status}`
      if (res.status < 500) logger.error(message)
      else logger.warn(message)
      return null
    }
    const parsed: unknown = await res.json()
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    logger.warn(`NirikshaAI guard: unexpected response shape from ${url}`)
    return null
  } catch (err) {
    logger.warn(`NirikshaAI guard: ${url} unreachable (${String(err)})`)
    return null
  }
}

/**
 * Apply the configured fail mode.
 *
 * Never silent. Every fail-open trip logs and is countable, because a security
 * control that quietly stops working is worse than one that was never installed
 * — the second is at least known to be absent.
 */
function failVerdict(text: string): GuardVerdict {
  countFailOpen()

  if (_guardState.failMode === 'closed') {
    logger.warn('NirikshaAI guard: unreachable and fail mode is closed — blocking')
    return { ...emptyVerdict(), action: ACTION_BLOCK, failedOpen: true }
  }

  if (_guardState.failMode === 'secrets_closed') {
    const findings = localSecretFindings(text)
    if (findings.length > 0) {
      logger.warn(
        `NirikshaAI guard: unreachable; blocking locally on ${findings.length} secret pattern(s)`,
      )
      return { ...emptyVerdict(), action: ACTION_BLOCK, findings, failedOpen: true }
    }
  }

  logger.warn(
    `NirikshaAI guard: unreachable — allowing text through (fail mode ${_guardState.failMode}). ` +
      'Text is NOT being checked.',
  )
  return { ...emptyVerdict(), action: ACTION_ALLOW, failedOpen: true }
}

/**
 * Increment guard.fail_open, if a meter is available.
 *
 * Wrapped because the counter is a diagnostic: failing to record it must never
 * turn a guard outage into an application crash.
 */
function countFailOpen(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { metrics } = require('@opentelemetry/api') as typeof import('@opentelemetry/api')
    metrics
      .getMeter('nirikshaai.guard')
      .createCounter('guard.fail_open', {
        description: 'Guard calls that could not reach the server',
      })
      .add(1, { fail_mode: _guardState.failMode })
  } catch {
    logger.debug('NirikshaAI guard: could not record the fail_open counter')
  }
}

function worstAction(verdicts: GuardVerdict[]): GuardAction {
  const rank: Record<GuardAction, number> = { allow: 0, tag: 1, redact: 2, block: 3 }
  let worst: GuardAction = ACTION_ALLOW
  for (const v of verdicts) {
    if ((rank[v.action] ?? 0) > (rank[worst] ?? 0)) worst = v.action
  }
  return worst
}

// ── local secret patterns, for failMode 'secrets_closed' ───────────────────
//
// A deliberately small, prefix-anchored subset of the server's set. The point is
// not parity — the server has eighteen patterns, entropy gating and a placeholder
// denylist — but that the highest-confidence, zero-false-positive formats are
// still caught with no network call. Every one is a vendor's own key prefix, so a
// match is near-certain and a non-match is cheap.

const LOCAL_SECRETS: ReadonlyArray<readonly [string, RegExp]> = [
  ['aws_access_key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['github_token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g],
  ['github_pat', /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g],
  ['slack_token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
  ['stripe_secret_key', /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/g],
  ['google_api_key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['anthropic_api_key', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g],
  ['openai_api_key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ['private_key_block', /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/g],
  ['niriksha_api_key', /\bnai_(?:plat_)?[A-Za-z0-9]{20,}\b/g],
]

/**
 * Documentation values that match a real pattern. Without this the local check
 * would block on a README, and the first person it inconveniences would switch
 * the mode off.
 */
const LOCAL_PLACEHOLDERS = new Set(['akiaiosfodnn7example', 'aws_access_key_id'])

/** Detect embedded secret formats without calling the server. */
export function localSecretFindings(text: string): GuardFinding[] {
  if (!text) return []
  const findings: GuardFinding[] = []
  for (const [rule, pattern] of LOCAL_SECRETS) {
    // Each pattern is global and shared at module scope, so lastIndex must be
    // reset — otherwise a second call starts mid-string and misses the match.
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      if (!LOCAL_PLACEHOLDERS.has(match[0].toLowerCase())) {
        findings.push({
          category: 'secret',
          severity: 'critical',
          rule,
          confidence: 0.95,
          start: match.index,
          end: match.index + match[0].length,
          local: true,
        })
      }
      // A zero-length match would loop forever; none of these patterns can
      // produce one, but the guard costs nothing and the failure mode is a hang.
      if (match[0].length === 0) pattern.lastIndex++
    }
  }
  return findings
}
