# secure-husky-setup

> One-command security and CI setup for any Node.js project.

Automatically configures **Gitleaks**, **SonarQube**, **Smoke Tests**, and **Newman API Tests** as git hooks — so your team catches secrets, bad code, and broken APIs before they ever reach your repo.

---

## What It Does

| Hook | Tool | What It Checks |
|------|------|----------------|
| Pre-commit | Gitleaks | Scans staged files for hardcoded secrets, API keys, tokens |
| Pre-commit | SonarQube | Scans staged files for code quality issues, blocks on Quality Gate failure |
| Pre-push | Smoke Tests | Starts your server and runs `npm test` before every push |
| Pre-push | Newman | Runs your Postman collections automatically before every push |
| GitHub Actions | All of the above | Runs the full CI pipeline on every push to any branch |

**All hooks run on git diff only** — only changed files are scanned, keeping commits and pushes fast.

---

## Installation

```bash
npx secure-husky-setup init
```

That's it. No manual configuration needed.

---

## What Gets Set Up Automatically

```
your-project/
├── .husky/
│   ├── pre-commit        ← Gitleaks + SonarQube on staged files
│   └── pre-push          ← Smoke Tests + Newman on changed files
├── .github/
│   └── workflows/
│       └── ci-tests.yml  ← GitHub Actions CI pipeline
├── scripts/
│   └── run-ci-checks.sh  ← Standalone CI script (can be run manually)
├── sonar-project.properties  ← Auto-generated SonarQube config
└── .gitleaksignore           ← Excludes false-positive files
```

---

## How It Works

### Pre-Commit Hook
Every time you run `git commit`, the hook:
1. Gets the list of staged files via `git diff --cached`
2. Copies staged files to a temp directory
3. Runs **Gitleaks** on the temp directory — blocks commit if secrets found
4. Runs **SonarQube** on staged files only — blocks commit if Quality Gate fails

```
git commit
  → [Gitleaks]   Secrets found?     → BLOCK commit
  → [SonarQube]  Quality Gate fail? → BLOCK commit
  → All clear?                      → commit goes through
```

### Pre-Push Hook
Every time you run `git push`, the hook:
1. Checks git diff between local and remote — skips if nothing changed
2. Starts your server (`npm start`)
3. Runs your tests (`npm test`) — blocks push if tests fail
4. Looks for `*.postman_collection.json` files and runs them via Newman

```
git push
  → [Smoke Tests]  Server starts + npm test passes? → or BLOCK
  → [Newman]       All API tests pass?              → or BLOCK
  → All clear?                                      → push goes through
```

---

## SonarQube

The package is pre-configured to connect to the company SonarQube server. Projects are **created automatically** — no manual setup needed on the SonarQube dashboard.

To switch servers, update these values in `lib/sonarqube.js`:
```javascript
const SONAR_HOST_URL = 'http://your-server:9000';
const SONAR_TOKEN    = 'your-token';
```

---

## Newman (Postman API Tests)

Newman runs automatically if it finds a `*.postman_collection.json` file anywhere in your project. HTML reports are saved to `newman-reports/` after each run.

To add API tests:
1. Export your Postman collection as JSON
2. Place it anywhere in your project (not in `node_modules`)
3. Newman will find and run it automatically on every push

---

## Manually Running CI Checks

```bash
# Run smoke tests + Newman manually
sh scripts/run-ci-checks.sh

# Run pre-commit checks manually
sh .husky/pre-commit
```

---

## Moving Tests to Pre-Commit

By default, Smoke Tests + Newman run on **pre-push**. To move them to pre-commit, add one line to `.husky/pre-commit`:

```sh
./scripts/run-ci-checks.sh
```

---

## Requirements

- Node.js >= 16
- Git
- Java (required by SonarQube scanner — downloaded automatically)

---

## License

MIT