/**
 * Serverless flush wrapper.
 *
 * Ensures all pending spans, metrics, and log records are exported before
 * the function runtime is frozen or terminated (AWS Lambda, Google Cloud
 * Functions, Vercel Edge, etc.).
 *
 * Example:
 *   export const handler = withFlush(async (event) => {
 *     // your logic here
 *   })
 */
export function withFlush<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
): T {
  const wrapped = async (...args: unknown[]): Promise<unknown> => {
    try {
      return await fn(...args)
    } finally {
      // Lazy import avoids a circular dependency: serverless → index → serverless.
      const { flush } = await import('./index')
      await flush()
    }
  }
  return wrapped as T
}
