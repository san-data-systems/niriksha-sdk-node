import { propagation, context } from '@opentelemetry/api'
import type { Context } from '@opentelemetry/api'

/**
 * Return a new Context derived from `ctx` with the given Baggage entry added.
 *
 * Usage:
 *   const newCtx = setBaggageContext(context.active(), 'tenant.id', 'acme')
 *   context.with(newCtx, () => { ... })
 */
export function setBaggageContext(
  ctx: Context,
  key: string,
  value: string,
): Context {
  const existing = propagation.getBaggage(ctx) ?? propagation.createBaggage()
  const updated = existing.setEntry(key, { value })
  return propagation.setBaggage(ctx, updated)
}

/**
 * Read a Baggage entry from the currently active context.
 * Returns undefined when the key is absent or no Baggage is present.
 */
export function getBaggage(key: string): string | undefined {
  const bag = propagation.getBaggage(context.active())
  return bag?.getEntry(key)?.value
}
