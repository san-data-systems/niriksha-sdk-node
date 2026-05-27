# Contributing to @nirikshaai/sdk

Thank you for helping improve the NirikshaAI Node.js SDK!  
Product: [niriksha.ai](https://niriksha.ai) · Company: [sandatasystem.ai](https://sandatasystem.ai)

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

## Branching Strategy

This project uses a **main/develop model** with auto-versioning:

- **`develop` branch**: Feature work and development. PRs merge here → CI passes → dev build auto-publishes (`@nirikshaai/sdk@dev` with short SHA)
- **`main` branch**: Protected production branch. Only `develop` can merge here (branch gate enforces this) → Production release auto-publishes with auto-bumped semver

### Creating a feature or fix

1. **Create branch from `develop`** (not `main`):
   ```bash
   git checkout develop && git pull
   git checkout -b feature/my-feature
   ```

2. **Write code and commit** using Conventional Commits:
   - `feat: ...` → bumps minor version (e.g., 0.2.0 → 0.3.0)
   - `fix: ...` → bumps patch version (e.g., 0.2.0 → 0.2.1)
   - `chore: ...` → bumps patch version
   - Include `BREAKING CHANGE:` footer → bumps major version (0.2.0 → 1.0.0)

3. **Open PR to `develop`** (not `main`):
   ```bash
   git push -u origin feature/my-feature
   gh pr create --base develop --title "feat: my feature"
   ```

4. **After merge**, the CI automatically:
   - Builds the SDK
   - Publishes to npm as `@nirikshaai/sdk@X.Y.Z-dev.SHA` with `@dev` tag
   - Creates a GitHub pre-release

### Releasing to production

Only the `develop` branch can merge to `main`. This is enforced by a CI branch gate.

1. **When you're ready to release**, open a PR from `develop` → `main`
2. **CI verifies**: vulnerability audit, all tests pass
3. **Merge to `main`** — this triggers `release.yml`:
   - `mathieudutour/github-tag-action@v6.2` computes new semver (based on commit messages since last tag)
   - Version bumped in `package.json`
   - Tag pushed as `v*.*.*.` (e.g., `v0.3.0`)
   - `npm publish --access public --provenance` (with 3-retry loop)
   - GitHub Release created automatically

See [RELEASE.md](RELEASE.md) for detailed examples.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/). The commit type determines version bumping:

```
feat: add support for Hono.js middleware
  → bumps MINOR version (0.2.0 → 0.3.0)

fix: prevent timer leak in fetchWithRetry
  → bumps PATCH version (0.2.0 → 0.2.1)

chore: update dependencies
  → bumps PATCH version (0.2.0 → 0.2.1)

docs: add NestJS integration example
  → no version bump (docs-only changes)
```

For **breaking changes**, add a footer:

```
feat: redesign init() API

BREAKING CHANGE: removed deprecated options x and y
  → bumps MAJOR version (0.2.0 → 1.0.0)
```

## Pull Request Process

1. Branch from `develop` (not `main`)
2. Write tests first — ensure 80%+ coverage
3. Run `npm run lint && npm run typecheck && npm test` locally
4. Update `CHANGELOG.md` under `[Unreleased]`
5. Open PR to `develop` — all CI checks must pass

## Publishing & Releases

Releases are fully automated — no manual npm publish needed:

- **Dev builds**: Every merge to `develop` auto-publishes to npm with `@dev` tag
- **Stable releases**: Merge `develop` → `main` triggers automatic version bump and production release

See [RELEASE.md](RELEASE.md) for full release process and examples.

## Reporting Issues

Security vulnerabilities: see [SECURITY.md](SECURITY.md)
