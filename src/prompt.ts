import { _state } from './index'

export interface GetPromptOptions {
  version?: number
  variables?: Record<string, string>
}

/** Fetch and render a prompt template from NirikshaAI prompt vault. */
export async function getPrompt(name: string, options: GetPromptOptions = {}): Promise<string> {
  const { version, variables = {} } = options
  const body: Record<string, unknown> = { name, variables }
  if (version !== undefined) body.version = version

  const res = await fetch(`${_state.baseUrl}/api/v1/sdk/prompts/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': _state.apiKey },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`NirikshaAI getPrompt failed: HTTP ${res.status}`)
  const data = await res.json()
  return data?.data?.content ?? ''
}

/** List all prompt templates in the project. */
export async function listPrompts(): Promise<Array<{ id: string; name: string; description: string }>> {
  const res = await fetch(`${_state.baseUrl}/api/v1/sdk/prompts`, {
    headers: { 'X-API-Key': _state.apiKey },
  })
  if (!res.ok) throw new Error(`NirikshaAI listPrompts failed: HTTP ${res.status}`)
  const data = await res.json()
  return data?.data?.prompts ?? []
}
