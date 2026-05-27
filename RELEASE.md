# Release Guide — @nirikshaai/sdk (Node.js SDK)

> Product: [niriksha.ai](https://niriksha.ai) · Company: [sandatasystem.ai](https://sandatasystem.ai)  
> Maintainer: vbhadauriya@sandatasystem.com

---

## Overview

This SDK uses **fully automated releases** with a **main/develop branching model**:

- **`develop` branch**: All feature work. PRs merge here → dev build auto-publishes
- **`main` branch**: Production releases only. Protected — only `develop` can merge here
- **Auto-versioning**: `mathieudutour/github-tag-action@v6.2` computes semver from commit messages
- **Vulnerability gate**: `npm audit --audit-level=high` blocks merge if HIGH/CRITICAL CVEs found
- **npm publish**: 3-attempt retry loop with 30s backoff (handles E409 race conditions)
- **Provenance**: SLSA attestation (`--provenance`) links npm package to GitHub source

---

## Branching Model

```
develop ← feature/*, fix/*, enhance/* branches
  ↓
[PR → merge → CI passes → dev build publishes]
  ↓
main ← develop (PR gated by CI)
  ↓
[PR → merge → auto-versioning → npm publish]
```

### Branch Protection Rules

| Branch | Rules |
|--------|-------|
| `develop` | Require PR, require CI to pass |
| `main` | Require PR, require CI to pass, **require source branch be `develop`** (branch gate) |

---

## Semantic Versioning

This project uses [Semantic Versioning 2.0.0](https://semver.org):

```
MAJOR . MINOR . PATCH
```

**Automatic version bumping** via commit message type:

| Commit type | Version bump | Example |
|---|---|---|
| `feat:` | MINOR | 0.2.0 → 0.3.0 |
| `fix:`, `chore:` | PATCH | 0.2.0 → 0.2.1 |
| `BREAKING CHANGE:` footer | MAJOR | 0.2.0 → 1.0.0 |
| `docs:`, `refactor:`, `test:` | None | No release |

**Important:** Use conventional commit types in the subject line. The `[skip ci]` tag or commit body does not affect versioning.

---

## Development Release (dev build)

### Automatic: Every merge to `develop`

Workflow: `dev-release.yml`

1. Code merges to `develop`
2. GitHub Actions runs `dev-release.yml`
3. Computes version: `X.Y.Z-dev.{short-sha}` (e.g., `0.3.0-dev.a1b2c3d`)
4. Publishes to npm with `@dev` tag:
   ```bash
   npm publish --access public --tag dev --provenance
   ```
5. Creates GitHub pre-release

### Install dev build

```bash
# Latest dev build
npm install @nirikshaai/sdk@dev

# Specific dev build (if you know the SHA)
npm install @nirikshaai/sdk@0.3.0-dev.a1b2c3d
```

### View all published versions

```bash
npm view @nirikshaai/sdk versions --json
```

---

## Production Release

### Manual: Create PR from `develop` to `main`

1. **Create PR from `develop` → `main`:**
   ```bash
   git checkout develop && git pull
   git checkout -b release/prepare
   # Make any last-minute updates (CHANGELOG, docs, etc.)
   git push -u origin release/prepare
   gh pr create --base main --title "chore: prepare release"
   ```

2. **CI verifies:**
   - All tests pass (≥80% coverage)
   - Lint and typecheck clean
   - Vulnerability audit (`npm audit --audit-level=high`)
   - Branch gate: source is `develop` ✅

3. **Merge to `main`:**
   - Squash or rebase merge (clean history preferred)
   - This **triggers `release.yml`**

4. **Automated release workflow executes:**
   - `mathieudutour/github-tag-action@v6.2` analyzes commits since last tag
   - Computes new semver (e.g., 0.2.0 → 0.3.0 if `feat:` found)
   - Creates tag `vX.Y.Z` and pushes it
   - Updates `package.json` version, commits with `[skip ci]` marker
   - Publishes to npm:
     ```bash
     npm publish --access public --provenance
     ```
     (3-retry loop, 30s backoff for E409 race conditions)
   - Creates GitHub Release with release notes
   - Sends notification to #releases Slack channel (if configured)

5. **Verify release:**
   ```bash
   npm view @nirikshaai/sdk@latest
   ```

---

## Example Workflows

### Example 1: New feature (develop → main)

```bash
# 1. Feature branch from develop
git checkout develop && git pull
git checkout -b feature/llm-spans

# 2. Write code, commit with conventional message
echo "// LLM span helper" >> src/llm.ts
git add src/llm.ts
git commit -m "feat: add LLM span helpers for conversation tracking"

# 3. Open PR to develop
git push -u origin feature/llm-spans
gh pr create --base develop --title "feat: add LLM span helpers"

# 4. [After merge to develop] Dev build auto-publishes
#    npm install @nirikshaai/sdk@dev  ← works immediately

# 5. When ready for production: PR develop → main
git checkout develop && git pull
git checkout -b release/x.y.z
git push -u origin release/x.y.z
gh pr create --base main --title "Release x.y.z"

# 6. [After merge to main] Production release auto-triggers
#    Computes version: 0.2.0 → 0.3.0 (minor bump for feat:)
#    Publishes to npm @latest
#    Creates GitHub Release v0.3.0
```

### Example 2: Bug fix (develop → main)

```bash
# 1. Fix branch from develop
git checkout develop && git pull
git checkout -b fix/timer-leak

# 2. Commit with fix type
git commit -m "fix: prevent timer leak in fetchWithRetry"
git push -u origin fix/timer-leak

# 3. PR to develop, merge
gh pr create --base develop

# 4. Dev build: 0.2.0-dev.abc123

# 5. When releasing: PR develop → main
gh pr create --base main

# 6. Production release triggers
#    Computes: 0.2.0 → 0.2.1 (patch bump for fix:)
#    Publishes @nirikshaai/sdk@0.2.1
```

### Example 3: Breaking change (major bump)

```bash
# 1. Breaking change on feature branch
git checkout develop && git pull
git checkout -b feat/redesign-api

# 2. Commit with BREAKING CHANGE footer
git commit -m "feat: redesign init() API

BREAKING CHANGE: removed deprecated options x and y"

git push -u origin feat/redesign-api
gh pr create --base develop

# 3. Dev build: 0.2.0-dev.xyz789

# 4. PR develop → main
gh pr create --base main

# 5. Production release triggers
#    Computes: 0.2.0 → 1.0.0 (major bump for BREAKING CHANGE)
#    Publishes @nirikshaai/sdk@1.0.0
```

---

## Hotfix Process

For urgent production patches to `main`:

```bash
# 1. Branch from main (not develop)
git checkout main && git pull
git checkout -b hotfix/critical-bug

# 2. Fix and commit
git commit -m "fix: critical authentication bypass"

# 3. PR to main
git push -u origin hotfix/critical-bug
gh pr create --base main --title "hotfix: critical bug"

# 4. Merge to main → triggers release.yml
#    Version bumps: 0.2.0 → 0.2.1 (patch)
#    Publishes immediately

# 5. Also merge back to develop to keep in sync
git checkout develop && git pull
git merge main
git push origin develop
```

---

## Required Secrets

### GitHub Repository Secret

- **Name:** `NPM_TOKEN`
- **Type:** npm Automation token
- **Source:** npmjs.com → Account Settings → Access Tokens → Automation
- **Why Automation:** Bypasses 2FA enforcement in CI. Classic/Granular tokens fail with 2FA enabled.
- **Setup:** See [REGISTRY_SETUP.md](#registry-setupmd) section 2.3-2.4

### Auto-provided Secrets

- `GITHUB_TOKEN` — auto-injected, used for creating releases and pushing tags
- No other secrets needed

---

## Release Checklist

Before merging `develop` → `main`:

- [ ] All commits follow conventional commit format
- [ ] `npm test` passes with ≥80% coverage
- [ ] `npm run lint` is clean
- [ ] `npm run typecheck` is clean
- [ ] `npm audit --audit-level=high` passes (no HIGH/CRITICAL vulns)
- [ ] CHANGELOG.md has entries under `[Unreleased]` (optional but recommended)
- [ ] No hardcoded secrets or environment-specific values

---

## Troubleshooting

### Release didn't publish to npm

1. **Check GitHub Actions workflow:**
   - Go to repo → Actions → look for `release` workflow
   - Click latest run, check logs for errors

2. **Common causes:**
   - `NPM_TOKEN` secret not set or expired
   - E409 error → retry (should auto-retry 3 times)
   - Vulnerability audit failed → fix CVEs before merging

3. **Manual publish (if needed):**
   ```bash
   git checkout main && git pull
   npm ci
   npm run build
   npm publish --access public --provenance --tag latest
   ```

### Semver computed incorrectly

The `github-tag-action` analyzes **all commits** since the last tag (not just the latest commit).

- Ensure commit messages strictly follow conventional commits format
- Preview what will be computed by checking recent commits:
  ```bash
  git log --oneline --graph main...develop
  ```

### Need to skip CI for a commit

Use `[skip ci]` in the commit message:

```bash
git commit -m "docs: update README [skip ci]"
```

This is used internally by the release workflow (auto-generated commits).

---

## FAQ

**Q: Can I publish to npm manually?**  
A: Not recommended. The automated workflow handles versioning, tags, and provenance. If needed for debugging, see "Manual publish" under Troubleshooting.

**Q: Can feature branches deploy to npm?**  
A: Only `develop` and `main` deploy. Feature branches must merge to `develop` first.

**Q: What if I make a mistake and release the wrong version?**  
A: Publish a new patch release. You can also use npm dist-tags to mark a version as `@latest` or `@dev` if needed.

**Q: How do I release a pre-release (alpha, beta, RC)?**  
A: Create a tag manually:
  ```bash
  git tag -a v0.3.0-rc.1 -m "Release candidate 1"
  git push origin v0.3.0-rc.1
  ```
  `release.yml` will auto-detect the prerelease format and publish with the correct tag.

**Q: Does the branch gate really block non-develop PRs to main?**  
A: Yes. The GitHub branch protection rule and CI check enforce it. You cannot merge to `main` from any branch except `develop`.

---

For contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).  
For registry account setup, see [REGISTRY_SETUP.md](REGISTRY_SETUP.md).
