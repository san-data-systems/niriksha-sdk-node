# Contributing to @nirikshaai/sdk

Thank you for helping improve the NirikshaAI Node.js SDK!  
Product: [niriksha.ai](https://niriksha.ai)

## Development Setup

```bash
git clone https://github.com/san-data-systems/niriksha-sdk-node
cd niriksha-sdk-node
npm install
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run unit tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint TypeScript source |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run typecheck` | Type-check without emitting |
| `npm run build` | Build CJS + ESM outputs |
| `npm run format` | Format with Prettier |

## Branch Naming & Strategy

See [RELEASE.md](RELEASE.md) for the full branching strategy and release process.

| Branch prefix | Purpose | Merges into |
|---------------|---------|-------------|
| `feature/` | New features | `main` |
| `fix/` | Bug fixes | `main` |
| `hotfix/` | Urgent production patches | `main` |
| `enhance/` | CI, docs, deps improvements | `main` |
| `release/x.y.z` | Release preparation | `main` |

**Rule:** Branch from `main`, PR back to `main`. Keep branches short-lived.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add support for Hono.js middleware
fix: prevent timer leak in fetchWithRetry
docs: add NestJS integration example
```

## Pull Request Process

1. Branch from `main`
2. Write tests first — ensure 80%+ coverage
3. Run `npm run lint && npm run typecheck && npm test` locally
4. Update `CHANGELOG.md` under `[Unreleased]`
5. Open PR — all CI checks must pass

## Publishing

Releases are automated: merge to `main` and push a `v*` tag to trigger npm publish.

## Reporting Issues

Security vulnerabilities: see [SECURITY.md](SECURITY.md)
