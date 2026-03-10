const fs = require('fs-extra');
const path = require('path');
const { logInfo, logSuccess } = require('./logger');

exports.setupPreCommitHook = async () => {
  const huskyDir = path.join(process.cwd(), '.husky');
  const hookPath = path.join(huskyDir, 'pre-commit');

  if (!await fs.pathExists(huskyDir)) {
    logInfo("Husky directory not found. Skipping hook setup.");
    return;
  }

  const hookContent = buildHookScript();

  if (await fs.pathExists(hookPath)) {
    const existing = await fs.readFile(hookPath, 'utf-8');

    if (existing.includes('gitleaks') || existing.includes('sonar-scanner')) {
      logInfo("Pre-commit hook already configured. Overwriting with latest setup...");
    } else {
      logInfo("Updating existing pre-commit hook...");
    }
  } else {
    logInfo("Creating new pre-commit hook...");
  }

  await fs.writeFile(hookPath, hookContent);
  await fs.chmod(hookPath, 0o755);
  logSuccess("Pre-commit hook created with Gitleaks + SonarQube (staged files only).");
};

function buildHookScript() {
  return `#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# ---------------------------------------------------------------
# Get only the files staged for this commit
# ---------------------------------------------------------------
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
  echo "No staged files to scan. Skipping security checks."
  exit 0
fi

echo "Staged files to scan:"
echo "$STAGED_FILES"

# ---------------------------------------------------------------
# Step 1: Gitleaks — scan staged files for secrets
# ---------------------------------------------------------------
echo ""
echo "[Gitleaks] Scanning staged files for secrets..."

GITLEAKS_BIN="./.tools/gitleaks/gitleaks"

if [ ! -f "$GITLEAKS_BIN" ]; then
  echo "[Gitleaks] Binary not found at $GITLEAKS_BIN. Skipping."
else
  # Write staged files to a temp path list for gitleaks
  TMPFILE=$(mktemp)
  echo "$STAGED_FILES" > "$TMPFILE"

  $GITLEAKS_BIN detect --source . --no-git --verbose \\
    $(echo "$STAGED_FILES" | awk '{print "--path="$0}' | tr '\\n' ' ')

  GITLEAKS_EXIT=$?
  rm -f "$TMPFILE"

  if [ $GITLEAKS_EXIT -ne 0 ]; then
    echo "[Gitleaks] Secrets detected! Commit blocked."
    exit 1
  fi

  echo "[Gitleaks] No secrets found."
fi

# ---------------------------------------------------------------
# Step 2: SonarQube — analyze only staged files
# ---------------------------------------------------------------
echo ""
echo "[SonarQube] Running analysis on staged files..."

SONAR_BIN="./node_modules/.bin/sonar-scanner"

if [ ! -f "$SONAR_BIN" ]; then
  echo "[SonarQube] sonar-scanner not found. Skipping."
else
  if [ ! -f "sonar-project.properties" ]; then
    echo "[SonarQube] sonar-project.properties not found. Skipping."
  else
    # Build comma-separated list of staged files for sonar.inclusions
    SONAR_INCLUSIONS=$(echo "$STAGED_FILES" | tr '\\n' ',' | sed 's/,$//')

    echo "[SonarQube] Scanning inclusions: $SONAR_INCLUSIONS"

    $SONAR_BIN \\
      -Dsonar.inclusions="$SONAR_INCLUSIONS" \\
      -Dsonar.analysis.mode=publish

    SONAR_EXIT=$?

    if [ $SONAR_EXIT -ne 0 ]; then
      echo "[SonarQube] Analysis failed or quality gate not passed. Commit blocked."
      exit 1
    fi

    echo "[SonarQube] Analysis passed."
  fi
fi

exit 0
`;
}