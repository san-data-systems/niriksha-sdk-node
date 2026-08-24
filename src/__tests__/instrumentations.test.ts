import { describe, it, expect } from 'vitest'

import { LLM_INSTRUMENTATION_CANDIDATES, resolveInstrumentationClass } from '../index'

/**
 * Packages that do NOT exist on npm and must never be listed again.
 *
 * `@opentelemetry/instrumentation-anthropic` and `-langchain` were both in the
 * candidate list and are both 404 on the registry, so Anthropic and LangChain
 * tracing silently never worked: require() threw MODULE_NOT_FOUND and the
 * loader's bare catch swallowed it.
 */
const NONEXISTENT_PACKAGES = [
  '@opentelemetry/instrumentation-anthropic',
  '@opentelemetry/instrumentation-langchain',
  '@opentelemetry/instrumentation-bedrock',
  '@opentelemetry/instrumentation-cohere',
  '@opentelemetry/instrumentation-vertexai',
  '@traceloop/instrumentation-ollama',
  '@traceloop/instrumentation-crewai',
  '@traceloop/instrumentation-weaviate',
  '@traceloop/instrumentation-milvus',
  '@traceloop/instrumentation-sagemaker',
]

describe('LLM_INSTRUMENTATION_CANDIDATES', () => {
  it('lists no package known not to exist on npm', () => {
    const listed = LLM_INSTRUMENTATION_CANDIDATES.flatMap((c) => c.pkgs)
    const bad = listed.filter((p) => NONEXISTENT_PACKAGES.includes(p))
    expect(bad, `these packages do not exist on npm: ${bad.join(', ')}`).toEqual([])
  })

  it('never lists the same package twice', () => {
    const listed = LLM_INSTRUMENTATION_CANDIDATES.flatMap((c) => c.pkgs)
    expect(listed).toHaveLength(new Set(listed).size)
  })

  it('never registers the same class twice, which would double-instrument', () => {
    const classes = LLM_INSTRUMENTATION_CANDIDATES.map((c) => c.cls)
    expect(classes).toHaveLength(new Set(classes).size)
  })

  it('gives every entry at least one candidate package and a class name', () => {
    for (const c of LLM_INSTRUMENTATION_CANDIDATES) {
      expect(c.pkgs.length, `${c.cls} has no candidate packages`).toBeGreaterThan(0)
      expect(c.cls).toMatch(/Instrumentation$/)
    }
  })

  it('scopes every package to @opentelemetry or @traceloop', () => {
    for (const pkg of LLM_INSTRUMENTATION_CANDIDATES.flatMap((c) => c.pkgs)) {
      expect(pkg).toMatch(/^@(opentelemetry|traceloop)\/instrumentation-/)
    }
  })
})

describe('resolveInstrumentationClass', () => {
  class FooInstrumentation {}

  it('prefers the named export', () => {
    const other = class BarInstrumentation {}
    const mod = { FooInstrumentation, BarInstrumentation: other }
    expect(resolveInstrumentationClass(mod, 'FooInstrumentation')).toBe(FooInstrumentation)
  })

  it('falls back to a default export', () => {
    expect(resolveInstrumentationClass({ default: FooInstrumentation }, 'MissingInstrumentation'))
      .toBe(FooInstrumentation)
  })

  it('falls back to scanning for any *Instrumentation export', () => {
    // Guards the silent-failure mode: a renamed export used to yield no spans
    // and no error, because the loader only ever checked one hardcoded name.
    const mod = { RenamedInstrumentation: FooInstrumentation }
    expect(resolveInstrumentationClass(mod, 'FooInstrumentation')).toBe(FooInstrumentation)
  })

  it('ignores non-function exports when scanning', () => {
    expect(resolveInstrumentationClass({ NotAClassInstrumentation: 42 }, 'Missing')).toBeUndefined()
  })

  it('returns undefined for a module with nothing usable', () => {
    expect(resolveInstrumentationClass({ helper: () => undefined }, 'Missing')).toBeUndefined()
  })

  it('does not throw on null or undefined modules', () => {
    expect(resolveInstrumentationClass(null, 'Missing')).toBeUndefined()
    expect(resolveInstrumentationClass(undefined, 'Missing')).toBeUndefined()
  })
})
