'use strict';

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const { logInfo, logSuccess, logError } = require('./logger');

const TEMPLATE_PATH = path.resolve(__dirname, '../templates/ci-tests.yml');

exports.setupCIScript = async (gitRoot) => {
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

exports.setupPrePushHook = async (gitRoot) => {
  const huskyDir = path.join(gitRoot, '.husky');
  const hookPath = path.join(huskyDir, 'pre-push');

  if (!await fs.pathExists(huskyDir)) {
    logInfo("Husky directory not found. Skipping pre-push hook setup.");
    return;
  }

  // relative path from gitRoot to project e.g. "server" or "."
  const projectDir = path.relative(gitRoot, process.cwd()) || '.';

  if (await fs.pathExists(hookPath)) {
    logInfo("Pre-push hook already configured. Overwriting with latest setup...");
  } else {
    logInfo("Creating new pre-push hook...");
  }

  await fs.writeFile(hookPath, buildPrePushHook(projectDir));
  await fs.chmod(hookPath, 0o755);
  logSuccess("Pre-push hook created — calls scripts/run-ci-checks.sh.");
};

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

exports.validateProject = async () => {
  const pkgPath = path.join(process.cwd(), 'package.json');

  if (!await fs.pathExists(pkgPath)) {
    logError("No package.json found. Skipping validation.");
    return;
  }

  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
  const scripts = pkg.scripts || {};

  if (!scripts.start) {
    logError('No "start" script in package.json — smoke tests will be skipped.');
    logInfo('Add:  "start": "node index.js"');
  }

  if (!scripts.test) {
    logError('No "test" script in package.json — smoke tests will be skipped.');
    logInfo('Add:  "test": "jest"  (or your test runner)');
  }

  if (scripts.start && scripts.test) {
    logSuccess('package.json has required "start" and "test" scripts.');
  }
};

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

function buildPrePushHook(projectDir) {
  // pre-push hook runs from git root
  // if project is in a subfolder, cd into it first so npm start/test work correctly
  // but git commands (rev-parse) in run-ci-checks.sh work from git root
  const cdLine = projectDir !== '.' ? `cd "${projectDir}"` : '';
  return `#!/bin/sh

# Pre-push hook — runs from git root
# cd into project subfolder so npm commands work
${cdLine ? cdLine + '\n' : ''}./scripts/run-ci-checks.sh
`;
}

function buildCIScript() {
  // This script runs from project directory (after cd in pre-push hook)
  // git commands use GIT_DIR env or walk up to find .git automatically
  return `#!/bin/sh

# ---------------------------------------------------------------
# run-ci-checks.sh
# Runs from project directory. Git commands work because git
# automatically finds .git by walking up the directory tree.
# ---------------------------------------------------------------

# Git diff check — only run if actual files changed
LOCAL=$(git rev-parse @ 2>/dev/null)
REMOTE=$(git rev-parse @{u} 2>/dev/null)

if [ "$REMOTE" != "" ] && [ "$LOCAL" = "$REMOTE" ]; then
  echo "[CI Checks] No changes to push. Skipping."
  exit 0
fi

if [ "$REMOTE" != "" ]; then
  CHANGED=$(git diff --name-only "$REMOTE" "$LOCAL" 2>/dev/null)
else
  CHANGED=$(git diff --name-only HEAD~1 HEAD 2>/dev/null)
fi

if [ -z "$CHANGED" ]; then
  echo "[CI Checks] No changed files detected. Skipping."
  exit 0
fi

echo ""
echo "[CI Checks] Changed files detected:"
echo "$CHANGED" | sed 's/^/  -> /'
echo ""
echo "[CI Checks] Starting checks..."

# Check if start and test scripts exist
START_SCRIPT=$(node -e "try{const p=require('./package.json');console.log(p.scripts&&p.scripts.start?'yes':'no')}catch(e){console.log('no')}" 2>/dev/null)
TEST_SCRIPT=$(node -e "try{const p=require('./package.json');console.log(p.scripts&&p.scripts.test?'yes':'no')}catch(e){console.log('no')}" 2>/dev/null)

if [ "$START_SCRIPT" = "no" ]; then
  echo "[Smoke Tests] No start script in package.json — skipping smoke tests."
  exit 0
fi

# ---------------------------------------------------------------
# Smoke Tests — start server + run tests
# ---------------------------------------------------------------
echo ""
echo "[Smoke Tests] Starting server..."

npm start &
SERVER_PID=\$!

# Auto-detect port
SERVER_UP=0
for i in \$(seq 1 30); do
  # Check if server process died
  if ! kill -0 \$SERVER_PID 2>/dev/null; then
    echo "[Smoke Tests] Server process crashed."

    read -p "Server crashed. Do you still want to push? (y/N): " confirm

    if [ "\$confirm" != "y" ] && [ "\$confirm" != "Y" ]; then
      echo "Push aborted."
      exit 1
    else
      echo "Continuing push without smoke tests..."
      exit 0
    fi
  fi

  for PORT_TRY in 3000 5000 8000 8080 4000 4200 3001 8081 1337; do
    if curl -sf http://localhost:\$PORT_TRY > /dev/null 2>&1; then
      PORT=\$PORT_TRY
      SERVER_UP=1
      echo "[Smoke Tests] Server is up on port \$PORT."
      break 2
    fi
  done

  echo "[Smoke Tests] Waiting for server... (\$i/30)"
  sleep 1
done

if [ \$SERVER_UP -eq 0 ]; then
  echo "[Smoke Tests] Server did not start in time. Aborting."
  kill \$SERVER_PID 2>/dev/null
  exit 1
fi

if [ "$TEST_SCRIPT" = "no" ]; then
  echo "[Smoke Tests] No test script in package.json — skipping npm test."
else
  echo "[Smoke Tests] Running npm test..."
  npm test
  SMOKE_EXIT=\$?
  if [ \$SMOKE_EXIT -ne 0 ]; then
    kill \$SERVER_PID 2>/dev/null
    echo "[Smoke Tests] Failed. Push blocked."
    exit 1
  fi
  echo "[Smoke Tests] Passed. ✔"
fi

# ---------------------------------------------------------------
# Newman API Tests
# ---------------------------------------------------------------
echo ""
echo "[Newman] Looking for Postman collections..."

COLLECTIONS=\$(find . \\
  -not -path '*/node_modules/*' \\
  -not -path '*/.git/*' \\
  -not -path '*/scripts/*' \\
  \\( -name "*.postman_collection.json" -o -name "collection.json" \\) \\
  2>/dev/null)

if [ -z "\$COLLECTIONS" ]; then
  echo "[Newman] No Postman collection found. Skipping."
  kill \$SERVER_PID 2>/dev/null
  exit 0
fi

if ! command -v newman > /dev/null 2>&1; then
  echo "[Newman] Installing newman..."
  npm install -g newman newman-reporter-htmlextra 2>/dev/null || true
fi

mkdir -p newman-reports

ENV_FILE=\$(find . \\
  -not -path '*/node_modules/*' \\
  -not -path '*/.git/*' \\
  -name "*.postman_environment.json" \\
  2>/dev/null | head -1)

NEWMAN_EXIT=0
for COLLECTION in \$COLLECTIONS; do
  REPORT_NAME=\$(basename "\$COLLECTION" .json)
  echo "[Newman] Running: \$COLLECTION"

  ENV_FLAG=""
  if [ -n "\$ENV_FILE" ]; then
    ENV_FLAG="--environment \$ENV_FILE"
  fi

  newman run "\$COLLECTION" \\
    \$ENV_FLAG \\
    --env-var "baseUrl=http://localhost:\${PORT:-3000}" \\
    --reporters cli,htmlextra \\
    --reporter-htmlextra-export "newman-reports/\${REPORT_NAME}-report.html" \\
    --bail

  if [ \$? -ne 0 ]; then
    NEWMAN_EXIT=1
  fi
done

kill \$SERVER_PID 2>/dev/null

if [ \$NEWMAN_EXIT -ne 0 ]; then
  echo "[Newman] One or more collections failed. Push blocked."
  exit 1
fi

echo "[Newman] All collections passed. ✔"
exit 0
`;
}