# Release Guide — @nirikshaai/sdk (Node.js SDK)

> Product: [niriksha.ai](https://niriksha.ai)  
> Maintainer: vbhadauriya@redcloudcomputing.com

---

## Versioning Scheme

This SDK follows [Semantic Versioning 2.0.0](https://semver.org):

```
MAJOR . MINOR . PATCH
│       │       └── Bug fixes, security patches (backwards compatible)
│       └────────── New features (backwards compatible)
└────────────────── Breaking API changes
```

### Version Lifecycle

| Version Pattern | Meaning | npm tag | Published to |
|----------------|---------|---------|-------------|
| `0.2.0-dev.abc1234` | Auto dev build (every merge to `main`) | `dev` | npm + GitHub pre-release |
| `0.2.1-alpha.1` | Alpha — early feature preview | `alpha` | npm pre-release |
| `0.2.1-beta.1` | Beta — feature complete, needs testing | `beta` | npm pre-release |
| `0.2.1-rc.1` | Release candidate — final testing | `next` | npm pre-release |
| `0.2.1` | Stable release | `latest` | npm stable |
| `1.0.0` | First stable API contract | `latest` | npm stable |

> **Why not v0.0.0?** We start at `0.2.0`. `0.0.0` is a placeholder meaning "not yet versioned". `0.x.y` means the public API may still evolve; `1.0.0` signals a stable, committed public API.

### Install a specific version

```bash
# Stable (latest)
npm install @nirikshaai/sdk
npm install @nirikshaai/sdk@0.2.0

# Latest dev build (auto-published on every main merge)
npm install @nirikshaai/sdk@dev

# Specific dev build
npm install @nirikshaai/sdk@0.2.0-dev.abc1234

# Pre-release channels
npm install @nirikshaai/sdk@alpha
npm install @nirikshaai/sdk@beta
npm install @nirikshaai/sdk@next   # RC channel
```

---

## Branching Strategy

```
main                  ← Protected. Every merge auto-publishes a dev build.
│
├── feature/xxx       ← New features. PR → main.
├── fix/xxx           ← Bug fixes. PR → main.
├── hotfix/xxx        ← Urgent production patches. PR → main.
├── enhance/xxx       ← Improvements (docs, CI, deps). PR → main.
└── release/x.y.z     ← Release preparation. PR → main, then tag.
```

### Branch rules (configure in GitHub → Settings → Branches)

| Branch | Protection |
|--------|-----------|
| `main` | Require PR, require CI to pass, no force-push |

---

## Release Types

### 1. Patch Release (0.2.0 → 0.2.1)
**When:** Bug fix, security patch, dependency bump. No new public API.

```bash
# 1. Branch from main
git checkout main && git pull
git checkout -b release/0.2.1

# 2. Bump version
npm version patch --no-git-tag-version
# Updates package.json: 0.2.0 → 0.2.1

# 3. Also update SDK_VERSION constant in src/index.ts
#    const SDK_VERSION = '0.2.0'  →  const SDK_VERSION = '0.2.1'
vim src/index.ts

# 4. Update CHANGELOG.md
#    Move [Unreleased] entries to [0.2.1] with today's date

# 5. Commit and open PR
git add package.json package-lock.json src/index.ts CHANGELOG.md
git commit -m "chore: release 0.2.1"
git push -u origin release/0.2.1
gh pr create --base main --title "chore: release 0.2.1"

# 6. After PR merged, tag
git checkout main && git pull
git tag -a v0.2.1 -m "Release v0.2.1"
git push origin v0.2.1
# → release.yml publishes to npm automatically
```

### 2. Minor Release (0.2.0 → 0.3.0)
**When:** New backwards-compatible features.

Same steps: `npm version minor --no-git-tag-version`, tag `v0.3.0`.

### 3. Major Release (0.x.y → 1.0.0)
**When:** Breaking API changes (removing/renaming exported symbols).

```bash
npm version major --no-git-tag-version
git tag -a v1.0.0 -m "Release v1.0.0"
```

### 4. Pre-release (alpha / beta / RC)

```bash
# Alpha — publish to npm under @alpha tag
git tag -a v0.3.0-alpha.1 -m "Alpha 1 for 0.3.0"
git push origin v0.3.0-alpha.1
# → release.yml publishes: npm publish --tag alpha

# Beta
git tag -a v0.3.0-beta.1 -m "Beta 1 for 0.3.0"
git push origin v0.3.0-beta.1
# → release.yml publishes: npm publish --tag beta

# Release Candidate
git tag -a v0.3.0-rc.1 -m "RC 1 for 0.3.0"
git push origin v0.3.0-rc.1
# → release.yml publishes: npm publish --tag next
```

### 5. Dev Build (automatic)
**When:** Every merge to `main` — no manual action required.

The `dev-release.yml` workflow automatically:
1. Computes version `0.2.0-dev.{short-sha}`
2. Publishes to npm under the `dev` dist-tag
3. Creates a GitHub pre-release

```bash
# Install latest dev build
npm install @nirikshaai/sdk@dev

# See all published versions including dev
npm view @nirikshaai/sdk versions --json
```

---

## Required Secrets & Setup (One-time)

| Secret | Purpose | How to get |
|--------|---------|-----------|
| `NPM_TOKEN` | Publish to npm registry | [npmjs.com/settings/tokens](https://www.npmjs.com/settings/~/tokens) → Create "Automation" token |
| `GITHUB_TOKEN` | Create releases | Auto-provided by GitHub Actions |
| `NVD_API_KEY` | Speed up OWASP/audit scans | [nvd.nist.gov/developers](https://nvd.nist.gov/developers/request-an-api-key) (free) |

### npm Scope Setup (one-time)
1. Create or join `@nirikshaai` organization at [npmjs.com](https://npmjs.com)
2. Generate an **Automation token** (works in CI without 2FA prompt)
3. Add as GitHub repo secret: `NPM_TOKEN`

### npm Provenance (already configured)
The workflows use `--provenance` which links the npm package to its GitHub source. Requires `id-token: write` permission (already set).

---

## Release Checklist

- [ ] All CI checks green on `main`
- [ ] `npm test` passes with ≥80% coverage
- [ ] `npm run lint` clean
- [ ] `npm run typecheck` clean
- [ ] CHANGELOG.md updated — `[Unreleased]` moved to `[x.y.z]` with date
- [ ] Version bumped in `package.json` AND `src/index.ts`
- [ ] PR merged to `main`
- [ ] Tag pushed: `git tag -a vX.Y.Z -m "Release vX.Y.Z" && git push origin vX.Y.Z`
- [ ] npm publish confirmed: `npm view @nirikshaai/sdk versions`
- [ ] GitHub Release created (auto by workflow)

---

## Hotfix Process

```bash
git checkout main && git pull
git checkout -b hotfix/fix-description

# Fix + test + bump patch
npm version patch --no-git-tag-version

git commit -m "fix: critical bug description"
git push -u origin hotfix/fix-description
gh pr create --base main --title "hotfix: critical bug"

# After merge
git checkout main && git pull
git tag -a v0.2.1 -m "Hotfix: critical bug"
git push origin v0.2.1
```

---

## CHANGELOG Management

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

```markdown
## [Unreleased]          ← new changes go here first
## [0.2.1] - 2025-06-01 ← moved here when releasing
## [0.2.0] - 2025-05-01
```

Every PR must include a CHANGELOG entry under `[Unreleased]`.
