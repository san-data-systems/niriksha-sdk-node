# npm Registry Setup Guide — @nirikshaai/sdk

> This guide covers one-time npm account and token setup for publishing the Node.js SDK.  
> Product: [niriksha.ai](https://niriksha.ai) · Company: [San Data Systems](https://sandatasystem.ai)  
> Maintainer: vbhadauriya@sandatasystem.com

---

## Table of Contents

1. [Create npm Account](#1-create-npm-account)
2. [Create Organization](#2-create-organization)
3. [Generate Automation Token](#3-generate-automation-token)
4. [Add Token to GitHub](#4-add-token-to-github)
5. [Verify Setup](#5-verify-setup)

---

## 1. Create npm Account

This account will be the **organization account** for NirikshaAI releases (not a personal developer account).

1. Go to [npmjs.com/signup](https://www.npmjs.com/signup)
2. Fill in:
   - **Username:** `nirikshaai` (use product name, not personal)
   - **Email:** `releases@niriksha.ai` (or team email that can receive notifications)
   - **Password:** Strong password (20+ chars, mix of upper/lower/numbers/symbols)
3. Verify your email address
4. **Enable Two-Factor Authentication:**
   - Go to [npmjs.com/settings/nirikshaai/profile](https://www.npmjs.com/settings/nirikshaai/profile)
   - Click **Security** → **Two-Factor Authentication**
   - Choose mode: **"Auth and writes"** (protects login + package publishing)
   - Save recovery codes in a secure location (password manager, etc.)

---

## 2. Create Organization

The `@nirikshaai` organization scope reserves the namespace and allows team members to publish under it.

1. Log in as `nirikshaai` at [npmjs.com](https://www.npmjs.com)
2. Go to [npmjs.com/org/create](https://www.npmjs.com/org/create)
3. Fill in:
   - **Organization name:** `nirikshaai`
   - **Plan:** Free (for open source packages)
4. Click **Create**
5. The scope `@nirikshaai` is now reserved

**Result:** Users can now install via `npm install @nirikshaai/sdk`

---

## 3. Generate Automation Token

**Important:** Use **Automation** token type (NOT Classic or Granular). Automation tokens bypass 2FA enforcement in CI, while Classic/Granular tokens fail when 2FA is enabled.

1. Log in as `nirikshaai` at [npmjs.com](https://www.npmjs.com)
2. Go to [npmjs.com/settings/nirikshaai/tokens](https://www.npmjs.com/settings/nirikshaai/tokens)
   - Or: click your avatar → **Access Tokens**
3. Click **Generate New Token**
4. Select type: **Automation**
5. Copy the token immediately (shown only once)
6. **Store securely** in a password manager

Example token format:
```
npm_abc123DEF456GHI789JKL...
```

> **Why Automation?** CI environments don't support interactive 2FA prompts. Automation tokens are specifically designed for this use case and bypass the 2FA requirement.

---

## 4. Add Token to GitHub

1. Go to [github.com/san-data-systems/niriksha-sdk-node/settings/secrets/actions](https://github.com/san-data-systems/niriksha-sdk-node/settings/secrets/actions)
2. Click **New repository secret**
3. Fill in:
   - **Name:** `NPM_TOKEN`
   - **Value:** Paste the Automation token from step 3
4. Click **Add secret**

**Result:** The GitHub Actions workflows can now publish to npm without 2FA prompts.

---

## 5. Verify Setup

### Method 1: After first dev build (merge to `develop`)

1. Merge any commit to `develop` branch
2. Wait ~2 minutes for GitHub Actions `dev-release.yml` to complete
3. Check that it published:
   ```bash
   npm view @nirikshaai/sdk@dev version
   # Output: 0.3.0-dev.a1b2c3d
   ```
4. Try installing:
   ```bash
   npm install @nirikshaai/sdk@dev
   node -e "const sdk = require('@nirikshaai/sdk'); console.log('SDK loaded:', typeof sdk.init)"
   ```

### Method 2: After first production release (merge to `main`)

1. Merge `develop` → `main`
2. Wait ~3 minutes for GitHub Actions `release.yml` to complete
3. Check the release:
   ```bash
   npm view @nirikshaai/sdk@latest version
   # Output: 0.3.0 (or whatever semver was computed)
   ```
4. Try installing:
   ```bash
   npm install @nirikshaai/sdk
   ```
5. Verify it works:
   ```bash
   node -e "const { init } = require('@nirikshaai/sdk'); console.log(typeof init)"
   # Output: function
   ```

### Method 3: Check npm org page

1. Go to [npmjs.com/package/@nirikshaai/sdk](https://www.npmjs.com/package/@nirikshaai/sdk)
2. Verify:
   - Package exists
   - Scope is `@nirikshaai`
   - Latest version is listed
   - `@dev`, `@latest`, etc. tags are visible

---

## Troubleshooting

### "EAUTHIDENTIFY: authentication error"

**Cause:** Token expired or incorrect

**Fix:**
1. Regenerate a new Automation token on npmjs.com
2. Update `NPM_TOKEN` secret in GitHub:
   - Go to repo Settings → Secrets → Actions
   - Delete old `NPM_TOKEN`
   - Add new one with fresh token

### "E409: ...registry error: Package version already exists"

**Cause:** Concurrent publishes tried to push the same version

**Fix:** The workflow includes automatic 3-retry backoff — it should resolve on its own. If it persists:
1. Check GitHub Actions logs
2. Delete the problematic version from npm (if you have admin access)
3. Re-run the workflow

### "Package name is reserved by another user/org"

**Cause:** Someone else claimed `@nirikshaai` before setup

**Fix:**
1. Check [npmjs.com/org/nirikshaai](https://www.npmjs.com/org/nirikshaai)
2. If it's unclaimed, contact npm support to reclaim
3. If claimed by someone else, choose a different scope (e.g., `@niriksha-ai`)

---

## GitHub Workflows Using This Token

### `dev-release.yml`
Runs on every merge to `develop`:
```yaml
- npm publish --tag dev --provenance
```

### `release.yml`
Runs when a tag matching `v*` is pushed (after merge to `main`):
```yaml
- npm publish --provenance
```

Both workflows use the `NPM_TOKEN` secret for authentication.

---

## Quick Reference

| Item | Value |
|------|-------|
| npm account username | `nirikshaai` |
| npm account email | `releases@niriksha.ai` |
| Organization scope | `@nirikshaai` |
| Package name | `@nirikshaai/sdk` |
| Token type | Automation (not Classic) |
| GitHub secret name | `NPM_TOKEN` |
| GitHub repository | `san-data-systems/niriksha-sdk-node` |

---

## One-Time Setup Checklist

- [ ] Create npm account (`nirikshaai`)
- [ ] Enable 2FA on npm account (Auth and writes mode)
- [ ] Create `@nirikshaai` organization on npm
- [ ] Generate Automation token
- [ ] Add `NPM_TOKEN` secret to GitHub Actions
- [ ] Test with dev build (merge to `develop`)
- [ ] Test with production release (merge to `main`)

---

For release workflow details, see [RELEASE.md](RELEASE.md).  
For contributing guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).
