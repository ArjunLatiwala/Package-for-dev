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

  // Fixed by Arjun — create .gitleaksignore to exclude .tools/ folder
  // (gitleaks README.md contains example secrets that trigger false positives)
  const gitleaksIgnorePath = path.join(process.cwd(), '.gitleaksignore');
  if (!await fs.pathExists(gitleaksIgnorePath)) {
    await fs.writeFile(gitleaksIgnorePath, '.tools/\n');
    logInfo(".gitleaksignore created to exclude .tools/ folder.");
  }

  logSuccess("Pre-commit hook created with Gitleaks + SonarQube (staged files only).");
};

function buildHookScript() {
  // Fixed by Arjun:
  // 1. Removed deprecated "#!/usr/bin/env sh" and ". husky.sh" lines (Husky v9 no longer needs them)
  // 2. Fixed gitleaks command — removed unsupported --path flag,
  //    now writes staged files to a temp dir and scans using --source
  return `#!/bin/sh

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
  # Fixed by Arjun — copy staged files into a temp directory and scan that
  # instead of using the unsupported --path flag
  TMPDIR=$(mktemp -d)

  # Copy staged files into temp dir for scanning
  echo "$STAGED_FILES" | while IFS= read -r FILE; do
    if [ -f "$FILE" ]; then
      DEST="$TMPDIR/$FILE"
      mkdir -p "$(dirname "$DEST")"
      cp "$FILE" "$DEST"
    fi
  done

  $GITLEAKS_BIN detect --source "$TMPDIR" --no-git --verbose
  GITLEAKS_EXIT=$?

  rm -rf "$TMPDIR"

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
    # Fixed by Arjun — skip SonarQube gracefully if not configured yet
    # Checks if token and organization are still set to placeholder values
    SONAR_TOKEN=$(grep "^sonar.token=" sonar-project.properties | cut -d'=' -f2 | tr -d '[:space:]')
    SONAR_ORG=$(grep "^sonar.organization=" sonar-project.properties | cut -d'=' -f2 | tr -d '[:space:]')

    if [ -z "$SONAR_TOKEN" ] || [ "$SONAR_TOKEN" = "YOUR_TOKEN_HERE" ]; then
      echo "[SonarQube] sonar.token not configured. Skipping analysis."
      echo "[SonarQube] Update sonar-project.properties to enable SonarQube scanning."
    elif [ -z "$SONAR_ORG" ] || [ "$SONAR_ORG" = "YOUR_ORGANIZATION_KEY" ]; then
      echo "[SonarQube] sonar.organization not configured. Skipping analysis."
      echo "[SonarQube] Update sonar-project.properties to enable SonarQube scanning."
    else
      SONAR_INCLUSIONS=$(echo "$STAGED_FILES" | tr '\n' ',' | sed 's/,$//')
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
fi

exit 0
`;
}