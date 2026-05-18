import { _state } from './index'

export interface GetPromptOptions {
  version?: number
  variables?: Record<string, string>
}

export interface PromptResponse {
  content: string
  tags?: string[]
  createdAt?: string
  updatedAt?: string
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface _CacheEntry { data: PromptResponse; expiresAt: number }
const _cache = new Map<string, _CacheEntry>()
const _CACHE_TTL_MS = 5 * 60 * 1000

function _cacheKey(name: string, options?: GetPromptOptions): string {
  return `${name}:${options?.version ?? 'latest'}:${JSON.stringify(options?.variables ?? {})}`
}

/** Manually invalidate the entire in-process prompt cache. */
export function clearPromptCache(): void {
  _cache.clear()
}

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

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
      console.debug(`[NirikshaAI] prompt retry attempt ${attempt}`)
      await sleep((attempt - 1) * 500)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        return res
      }
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastErr = err
    } finally {
      clearTimeout(timer)
    }
  }

  console.warn('[NirikshaAI] prompt request failed after all retries:', lastErr)
  throw lastErr
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Fetch and render a prompt template from NirikshaAI prompt vault. */
export async function getPrompt(name: string, options: GetPromptOptions = {}): Promise<string> {
  const key = _cacheKey(name, options)
  const cached = _cache.get(key)
  if (cached && Date.now() < cached.expiresAt) {
    console.debug(`[NirikshaAI] prompt cache hit: ${key}`)
    return cached.data.content
  }

  const { version, variables = {} } = options
  const body: Record<string, unknown> = { name, variables }
  if (version !== undefined) body.version = version

  const res = await fetchWithRetry(
    `${_state.baseUrl}/api/v1/sdk/prompts/render`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': _state.apiKey },
      body: JSON.stringify(body),
    },
    10_000,
  )

  if (!res.ok) throw new Error(`NirikshaAI getPrompt failed: HTTP ${res.status}`)

  const data = await res.json()
  const raw = data?.data ?? {}

  const promptResponse: PromptResponse = {
    content: raw.content ?? '',
    ...(raw.tags !== undefined ? { tags: raw.tags } : {}),
    ...(raw.created_at !== undefined ? { createdAt: raw.created_at } : {}),
    ...(raw.updated_at !== undefined ? { updatedAt: raw.updated_at } : {}),
  }

  _cache.set(key, { data: promptResponse, expiresAt: Date.now() + _CACHE_TTL_MS })

  return promptResponse.content
}

/** List all prompt templates in the project. */
export async function listPrompts(): Promise<Array<{ id: string; name: string; description: string }>> {
  const res = await fetchWithRetry(
    `${_state.baseUrl}/api/v1/sdk/prompts`,
    { headers: { 'X-API-Key': _state.apiKey } },
    10_000,
  )
  if (!res.ok) throw new Error(`NirikshaAI listPrompts failed: HTTP ${res.status}`)
  const data = await res.json()
  return data?.data?.prompts ?? []
}
