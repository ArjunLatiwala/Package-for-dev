# secure-husky-setup

> One-command security and CI setup for any Node.js project.

Automatically configures **Gitleaks** (secret scanning), **SonarQube** (code quality), **Smoke Tests**, and **Newman API Tests** as git hooks — so your team catches secrets, bad code, and broken APIs before they ever reach your repository.

---

## What It Does

| Hook | Tool | What It Checks |
|------|------|----------------|
| Pre-commit | Gitleaks | Scans staged files for hardcoded secrets, API keys, tokens |
| Pre-commit | SonarQube | Scans staged files for code quality issues, blocks on Quality Gate failure |
| Pre-push | Smoke Tests | Starts your server and runs `npm test` before every push |
| Pre-push | Newman | Runs your Postman API collections automatically before every push |
| GitHub Actions | All of the above | Runs the full CI pipeline on every push to any branch |

**All hooks run on git diff only** — only changed files are scanned, keeping commits and pushes fast.

---

## Requirements

Before installing this package, make sure your project has the following:

### 1. Git Repository (Required)
Your project must be initialized as a git repository. This package sets up git hooks which only work inside a git repo.

```bash
git init
git add .
git commit -m "initial commit"
```

> ⚠️ If you skip this step, the package will fail with **"Not inside a git repository"** during installation.

### 2. `start` Script in package.json (Required for Smoke Tests)
The pre-push hook boots your server using `npm start`. Without it, smoke tests are skipped.

```json
"scripts": {
  "start": "node index.js"
}
```

### 3. `test` Script in package.json (Required for Smoke Tests)
The pre-push hook runs `npm test` to verify your app works. Without it, the test step is skipped.

```json
"scripts": {
  "test": "jest"
}
```

> ℹ️ If `start` or `test` scripts are missing, the package will warn you during init but will NOT block your workflow — it simply skips those steps.

---

## Installation

### Step 1 — Initialize git (if not already done)

```bash
git init
git add .
git commit -m "initial commit"
```

### Step 2 — Install the package

```bash
npm install secure-husky-setup
```

### Step 3 — Run init

```bash
npx secure-husky-setup init
```

That's it. Everything is set up automatically — no manual configuration needed.

---

## What Gets Set Up Automatically

After running `init`, your project will have:

```
your-project/
├── .husky/
│   ├── pre-commit            ← Gitleaks + SonarQube on staged files
│   └── pre-push              ← Smoke Tests + Newman on changed files
├── .github/
│   └── workflows/
│       └── ci-tests.yml      ← GitHub Actions CI pipeline
├── scripts/
│   └── run-ci-checks.sh      ← Standalone CI script (can be run manually)
├── sonar-project.properties  ← Auto-generated SonarQube config
└── .gitleaksignore           ← Excludes false-positive files from Gitleaks
```

---

## How It Works

### Pre-Commit Hook
Every time you run `git commit`, the hook:
1. Gets only the staged files via `git diff --cached`
2. Copies staged files to a temp directory
3. Runs **Gitleaks** — blocks commit if secrets found
4. Checks if SonarQube server is reachable — skips gracefully if not
5. Runs **SonarQube** on staged files only — blocks commit if Quality Gate fails

```
git commit
  → [Gitleaks]   Secrets found?        → BLOCK commit ✖
  → [SonarQube]  Server reachable?     → No → skip gracefully
  → [SonarQube]  Quality Gate failed?  → BLOCK commit ✖
  → All clear?                         → commit goes through ✔
```

### Pre-Push Hook
Every time you run `git push`, the hook:
1. Checks git diff between local and remote — skips if nothing changed
2. Auto-detects which port your server runs on (3000, 5000, 8000, 8080, etc.)
3. Starts your server (`npm start`)
4. Runs your tests (`npm test`) — blocks push if tests fail
5. Looks for `*.postman_collection.json` files and runs them via Newman

```
git push
  → [Git Diff]    Nothing changed?     → skip everything
  → [Smoke Tests] Server starts?       → No → BLOCK push ✖
  → [Smoke Tests] npm test passes?     → No → BLOCK push ✖
  → [Newman]      API tests pass?      → No → BLOCK push ✖
  → All clear?                         → push goes through ✔
```

---

## SonarQube

The package is pre-configured to connect to the company SonarQube server. Projects are **created automatically** via API — no manual setup needed on the SonarQube dashboard.

**If the server is unreachable** (offline, different network, VPN), the scan is skipped gracefully and your commit goes through normally.

**To switch servers**, update these values in `lib/sonarqube.js`:
```javascript
const SONAR_HOST_URL = 'http://your-server:9000';
const SONAR_TOKEN    = 'your-token';
```

---

## Newman (Postman API Tests)

Newman runs automatically if it finds a `*.postman_collection.json` file anywhere in your project (outside `node_modules`).

**HTML reports** are saved locally to `newman-reports/` after each run — open in browser for detailed results.

**To add API tests:**
1. Export your Postman collection as JSON
2. Place it anywhere in your project
3. Newman finds and runs it automatically on every push

---

## Gitleaks (Secret Scanning)

Gitleaks scans only your staged files before every commit. It detects:
- AWS keys
- GitHub tokens
- Stripe keys
- Private keys
- Hardcoded passwords
- And 100+ other secret patterns

If a secret is detected, the commit is blocked immediately:
```
Finding: const stripe_key = "sk_live_..."
RuleID:  stripe-access-token
[Gitleaks] Secrets detected! Commit blocked.
```

---

## Manually Running Checks

```bash
# Run Gitleaks + SonarQube manually (without committing)
sh .husky/pre-commit

# Run Smoke Tests + Newman manually (without pushing)
sh scripts/run-ci-checks.sh
```

---

## Moving Tests to Pre-Commit

By default, Smoke Tests + Newman run on **pre-push**. To move them to pre-commit instead, add one line to `.husky/pre-commit`:

```sh
./scripts/run-ci-checks.sh
```

---

## Quick Reference

| Command | What it does |
|---------|-------------|
| `git init` | Initialize git repo (required before install) |
| `npm install secure-husky-setup` | Install the package |
| `npx secure-husky-setup init` | Set up all hooks and config |
| `git commit` | Triggers Gitleaks + SonarQube |
| `git push` | Triggers Smoke Tests + Newman |
| `sh .husky/pre-commit` | Run pre-commit checks manually |
| `sh scripts/run-ci-checks.sh` | Run pre-push checks manually |

---

## License

MIT