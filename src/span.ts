import { trace } from '@opentelemetry/api'

export interface RAGChunk {
  chunkId: string
  source: string
  score: number
  content?: string
}

export interface ToolCall {
  toolName: string
  callId: string
  input?: string   // JSON string
  output?: string  // JSON string
}

/**
 * Set conversation metadata on the active span.
 * Sets llm.conversation.id, and optionally llm.session.id and llm.turn.index.
 */
export function recordConversation(
  conversationId: string,
  sessionId?: string,
  turnIndex?: number,
): void {
  const span = trace.getActiveSpan()
  if (span === undefined) return

  span.setAttribute('llm.conversation.id', conversationId)
  if (sessionId !== undefined) {
    span.setAttribute('llm.session.id', sessionId)
  }
  if (turnIndex !== undefined) {
    span.setAttribute('llm.turn.index', turnIndex)
  }
}

/**
 * Add a span event for a retrieved RAG chunk.
 * Records rag.chunk.id, rag.source, rag.chunk.score, and optionally rag.chunk.content.
 */
export function recordRagChunk(chunk: RAGChunk): void {
  const span = trace.getActiveSpan()
  if (span === undefined) return

  const attrs: Record<string, string | number> = {
    'rag.chunk.id': chunk.chunkId,
    'rag.source': chunk.source,
    'rag.chunk.score': chunk.score,
  }
  if (chunk.content !== undefined) {
    attrs['rag.chunk.content'] = chunk.content
  }
  span.addEvent('rag.chunk.retrieved', attrs)
}

/**
 * Add a span event for an LLM tool invocation.
 * Records llm.tool.name, llm.tool.call_id, and optionally llm.tool.input and llm.tool.output.
 */
export function recordToolCall(call: ToolCall): void {
  const span = trace.getActiveSpan()
  if (span === undefined) return

  const attrs: Record<string, string> = {
    'llm.tool.name': call.toolName,
    'llm.tool.call_id': call.callId,
  }
  if (call.input !== undefined) {
    attrs['llm.tool.input'] = call.input
  }
  if (call.output !== undefined) {
    attrs['llm.tool.output'] = call.output
  }
  span.addEvent('llm.tool.call', attrs)
}
