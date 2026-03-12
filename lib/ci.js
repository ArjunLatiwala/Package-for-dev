'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Added by Arjun
// File: lib/ci.js
// Purpose: Sets up Newman API tests + Smoke Tests as a pre-push git hook
//          and copies the GitHub Actions CI workflow into the project.
//
// FLEXIBILITY NOTE:
//   Test logic lives in scripts/run-ci-checks.sh (standalone script).
//   The pre-push hook simply calls that script.
//   To move tests to pre-commit in future, just add one line to pre-commit hook:
//     ./scripts/run-ci-checks.sh
//   No logic needs to be rewritten.
//
// New files introduced:
//   - lib/ci.js                    (this file)
//   - templates/ci-tests.yml       (GitHub Actions workflow template)
// Changes made to existing files:
//   - bin/index.js                 (4 new lines added — see comments there)
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const { logInfo, logSuccess, logError } = require('./logger');

// Added by Arjun — path to the CI workflow template bundled with this package
const TEMPLATE_PATH = path.resolve(__dirname, '../templates/ci-tests.yml');

// ─────────────────────────────────────────────────────────────────────────────
// Added by Arjun — writes scripts/run-ci-checks.sh into the project
// This is the STANDALONE script containing all test logic.
// It can be called from pre-push, pre-commit, or any other hook.
// ─────────────────────────────────────────────────────────────────────────────
exports.setupCIScript = async () => {
  const scriptsDir = path.join(process.cwd(), 'scripts');
  const scriptPath = path.join(scriptsDir, 'run-ci-checks.sh');

  await fs.ensureDir(scriptsDir);

  if (await fs.pathExists(scriptPath)) {
    logInfo("run-ci-checks.sh already exists — overwriting with latest version.");
  } else {
    logInfo("Creating scripts/run-ci-checks.sh...");
  }

  await fs.writeFile(scriptPath, buildCIScript());
  await fs.chmod(scriptPath, 0o755);
  logSuccess("scripts/run-ci-checks.sh created.");
  logInfo("To move tests to pre-commit in future: add './scripts/run-ci-checks.sh' to .husky/pre-commit.");
};

// ─────────────────────────────────────────────────────────────────────────────
// Added by Arjun — sets up .husky/pre-push hook
// Simply calls run-ci-checks.sh — no logic lives here.
// ─────────────────────────────────────────────────────────────────────────────
exports.setupPrePushHook = async () => {
  const huskyDir = path.join(process.cwd(), '.husky');
  const hookPath = path.join(huskyDir, 'pre-push');

  if (!await fs.pathExists(huskyDir)) {
    logInfo("Husky directory not found. Skipping pre-push hook setup.");
    return;
  }

  if (await fs.pathExists(hookPath)) {
    logInfo("Pre-push hook already configured. Overwriting with latest setup...");
  } else {
    logInfo("Creating new pre-push hook...");
  }

  await fs.writeFile(hookPath, buildPrePushHook());
  await fs.chmod(hookPath, 0o755);
  logSuccess("Pre-push hook created — calls scripts/run-ci-checks.sh.");
};

// ─────────────────────────────────────────────────────────────────────────────
// Added by Arjun — copies ci-tests.yml into .github/workflows/
// ─────────────────────────────────────────────────────────────────────────────
exports.setupCIWorkflow = async () => {
  const targetDir  = path.join(process.cwd(), '.github', 'workflows');
  const targetFile = path.join(targetDir, 'ci-tests.yml');

  if (!await fs.pathExists(TEMPLATE_PATH)) {
    logError("CI template not found. Please reinstall the package.");
    return;
  }

  await fs.ensureDir(targetDir);

  if (await fs.pathExists(targetFile)) {
    logInfo("ci-tests.yml already exists — overwriting with latest version.");
  } else {
    logInfo("Creating .github/workflows/ci-tests.yml...");
  }

  await fs.copy(TEMPLATE_PATH, targetFile);
  logSuccess("GitHub Actions workflow copied to .github/workflows/ci-tests.yml");
};

// ─────────────────────────────────────────────────────────────────────────────
// Added by Arjun — validates package.json has required scripts
// ─────────────────────────────────────────────────────────────────────────────
exports.validateProject = async () => {
  const pkgPath = path.join(process.cwd(), 'package.json');

  if (!await fs.pathExists(pkgPath)) {
    logError("No package.json found. Skipping validation.");
    return;
  }

  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
  const scripts = pkg.scripts || {};

  if (!scripts.start) {
    logError('No "start" script in package.json — CI server boot will fail.');
    logInfo('Add:  "start": "node index.js"');
  }

  if (!scripts.test) {
    logError('No "test" script in package.json — smoke tests will fail.');
    logInfo('Add:  "test": "jest"  (or your test runner)');
  }

  if (scripts.start && scripts.test) {
    logSuccess('package.json has required "start" and "test" scripts.');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Added by Arjun — ensures package-lock.json exists (required by npm ci)
// ─────────────────────────────────────────────────────────────────────────────
exports.ensurePackageLock = async () => {
  const lockPath = path.join(process.cwd(), 'package-lock.json');
  const yarnPath = path.join(process.cwd(), 'yarn.lock');

  if (await fs.pathExists(lockPath) || await fs.pathExists(yarnPath)) {
    logSuccess("Lock file found (package-lock.json / yarn.lock).");
    return;
  }

  logInfo("No package-lock.json found — running npm install to generate it...");
  try {
    execSync('npm install', { stdio: 'inherit', cwd: process.cwd() });
    logSuccess("package-lock.json generated. Remember to commit it.");
  } catch {
    logError("Failed to generate package-lock.json. Run npm install manually.");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Pre-push hook — thin wrapper, just calls the standalone script
// To switch to pre-commit: remove this and add line to .husky/pre-commit
// ─────────────────────────────────────────────────────────────────────────────
function buildPrePushHook() {
  return `#!/bin/sh

# ---------------------------------------------------------------
# Pre-push hook — Newman + Smoke Tests
# Delegates all logic to scripts/run-ci-checks.sh
#
# To move tests to pre-commit in future:
#   Remove this file and add this line to .husky/pre-commit:
#   ./scripts/run-ci-checks.sh
# ---------------------------------------------------------------

./scripts/run-ci-checks.sh
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Standalone CI checks script — ALL test logic lives here
// Can be called from pre-push, pre-commit, CI, or manually:
//   sh scripts/run-ci-checks.sh
// ─────────────────────────────────────────────────────────────────────────────
function buildCIScript() {
  return `#!/bin/sh

# ---------------------------------------------------------------
# run-ci-checks.sh — Smoke Tests + Newman API Tests
#
# Called by .husky/pre-push by default.
# To move to pre-commit: add './scripts/run-ci-checks.sh' to .husky/pre-commit
# To run manually: sh scripts/run-ci-checks.sh
# ---------------------------------------------------------------

echo ""
echo "[CI Checks] Starting checks..."

# ---------------------------------------------------------------
# Step 1: Smoke Tests
# ---------------------------------------------------------------
echo ""
echo "[Smoke Tests] Starting server..."

npm start &
SERVER_PID=$!

for i in $(seq 1 30); do
  if curl -sf http://localhost:\${PORT:-3000}/health > /dev/null 2>&1 || \\
     curl -sf http://localhost:\${PORT:-3000} > /dev/null 2>&1; then
    echo "[Smoke Tests] Server is up."
    break
  fi
  echo "[Smoke Tests] Waiting for server... ($i/30)"
  sleep 1
done

echo "[Smoke Tests] Running npm test..."
npm test
SMOKE_EXIT=$?

kill $SERVER_PID 2>/dev/null

if [ $SMOKE_EXIT -ne 0 ]; then
  echo "[Smoke Tests] Failed. Push blocked."
  exit 1
fi

echo "[Smoke Tests] Passed. ✔"

# ---------------------------------------------------------------
# Step 2: Newman
# ---------------------------------------------------------------
echo ""
echo "[Newman] Looking for Postman collections..."

COLLECTIONS=$(find . \\
  -not -path '*/node_modules/*' \\
  -not -path '*/.git/*' \\
  -not -path '*/scripts/*' \\
  \\( -name "*.postman_collection.json" -o -name "collection.json" \\) \\
  2>/dev/null)

if [ -z "$COLLECTIONS" ]; then
  echo "[Newman] No Postman collection found. Skipping."
  exit 0
fi

if ! command -v newman > /dev/null 2>&1; then
  echo "[Newman] Installing newman globally..."
  npm install -g newman newman-reporter-htmlextra
fi

npm start &
SERVER_PID=$!

for i in $(seq 1 30); do
  if curl -sf http://localhost:\${PORT:-3000}/health > /dev/null 2>&1 || \\
     curl -sf http://localhost:\${PORT:-3000} > /dev/null 2>&1; then
    echo "[Newman] Server is up."
    break
  fi
  sleep 1
done

mkdir -p newman-reports

ENV_FILE=$(find . \\
  -not -path '*/node_modules/*' \\
  -not -path '*/.git/*' \\
  -name "*.postman_environment.json" \\
  2>/dev/null | head -1)

NEWMAN_EXIT=0
for COLLECTION in $COLLECTIONS; do
  REPORT_NAME=$(basename "$COLLECTION" .json)
  echo "[Newman] Running: $COLLECTION"

  ENV_FLAG=""
  if [ -n "$ENV_FILE" ]; then
    ENV_FLAG="--environment $ENV_FILE"
  fi

  newman run "$COLLECTION" \\
    $ENV_FLAG \\
    --env-var "baseUrl=http://localhost:\${PORT:-3000}" \\
    --reporters cli,htmlextra \\
    --reporter-htmlextra-export "newman-reports/\${REPORT_NAME}-report.html" \\
    --bail

  if [ $? -ne 0 ]; then
    NEWMAN_EXIT=1
  fi
done

kill $SERVER_PID 2>/dev/null

if [ $NEWMAN_EXIT -ne 0 ]; then
  echo "[Newman] One or more collections failed. Push blocked."
  exit 1
fi

echo "[Newman] All collections passed. ✔"
exit 0
`;
}