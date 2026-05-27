# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1] - 2026-05-27

### Added
- `main/develop` branching model — feature work on `develop`, production releases from `main`
- Auto-versioning via `mathieudutour/github-tag-action@v6.2` — `feat:` bumps minor, `fix:`/`chore:` bumps patch, `BREAKING CHANGE` bumps major
- Branch gate CI job blocking PRs to `main` from non-`develop` sources
- Vulnerability gate with `npm audit --audit-level=high` blocking HIGH/CRITICAL CVEs before merge
- npm publish retry loop (3 attempts, 30-second backoff) — fixes E409 race condition on concurrent publishes
- Dependabot vulnerability fixes via npm overrides: esbuild ≥0.25.0, vite ≥6.4.2, fastify ≥5.8.3, @nestjs/core ≥11.1.18 (zero CVEs)
- npm provenance publishing (SLSA attestation) for source authenticity verification
- Dev release automation: `@nirikshaai/sdk@dev` tagged builds published on every merge to `develop`
- Scoped npm package namespace: `@nirikshaai/sdk` on npmjs.com

### Changed
- README installation section now documents both stable (`npm install @nirikshaai/sdk`) and dev (`npm install @nirikshaai/sdk@dev`) install paths
- Contributing and Release guides updated for main/develop workflow

## [0.0.0] - 2026-05-27

### Added
- `dev-release.yml` workflow — auto-publishes `0.x.y-dev.{sha}` to npm `@dev` tag on every merge to `main`
- `RELEASE.md` — comprehensive versioning, branching, and release process guide
- Smart npm dist-tag selection in `release.yml` (alpha/beta/next/latest based on version string)
- Internal structured logger (`src/internal/logger.ts`) replacing bare `console.*` calls
- `NIRIKSHA_LOG_LEVEL` environment variable to control log verbosity (debug/info/warn/error)
- ESLint with `@typescript-eslint` and `eslint-plugin-security` configuration
- Prettier code formatting configuration
- Vitest coverage configuration (80% threshold)
- Unit tests: pii, logger, serverless modules
- GitHub Actions CI pipeline (lint, typecheck, test, build, audit)
- GitHub Actions release workflow (npm publish + GitHub Release on `v*` tags)
- CodeQL security analysis workflow
- `.gitignore`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`

### Fixed
- ReDoS vulnerability in credit-card PII regex (replaced catastrophic backtracking pattern)
- Timer leak in `fetchWithRetry` — replaced `AbortController`+`setTimeout` with `AbortSignal.timeout()`
- Dependency ranges changed from `^` to `~` for production stability

## [0.2.0] - 2025-05-01

### Added
- Initial public release
- OpenTelemetry traces, metrics, and logs via OTLP/gRPC
- Express.js and Fastify middleware
- LLM span helpers: conversation tracking, RAG chunks, tool calls
- PII redaction utilities
- W3C Baggage context propagation
- Serverless flush wrapper (`withFlush`)
- Eval submission (single and batch) with retry and timeout
- Prompt vault client with 5-minute TTL cache
- Dynamic instrumentation loading (auto-instruments popular libraries)
- Support for CommonJS and ESM

[Unreleased]: https://github.com/san-data-systems/niriksha-sdk-node/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/san-data-systems/niriksha-sdk-node/releases/tag/v0.2.0
