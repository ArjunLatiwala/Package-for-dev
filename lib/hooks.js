const fs = require('fs-extra');
const path = require('path');
const { logInfo, logSuccess } = require('./logger');

exports.setupPreCommitHook = async (gitRoot) => {
  const huskyDir = path.join(gitRoot, '.husky');
  const hookPath = path.join(huskyDir, 'pre-commit');

  if (!await fs.pathExists(huskyDir)) {
    logInfo("Husky directory not found. Skipping hook setup.");
    return;
  }

  // projectDir = relative path from gitRoot to where package.json lives
  // e.g. "server" for MERN, "." for normal projects
  const projectDir = path.relative(gitRoot, process.cwd()) || '.';
  const hookContent = buildHookScript(projectDir);

  if (await fs.pathExists(hookPath)) {
    logInfo("Pre-commit hook already configured. Overwriting with latest setup...");
  } else {
    logInfo("Creating new pre-commit hook...");
  }

  await fs.writeFile(hookPath, hookContent);
  await fs.chmod(hookPath, 0o755);

  const gitleaksIgnorePath = path.join(process.cwd(), '.gitleaksignore');
  await fs.writeFile(gitleaksIgnorePath, '.tools/\nsonar-project.properties\n');
  logInfo(".gitleaksignore created — excluding .tools/ and sonar-project.properties.");

  logSuccess("Pre-commit hook created with Gitleaks + SonarQube (git diff only).");
};

function buildHookScript(projectDir) {
  const isSubfolder = projectDir !== '.';

  const gitleaksBin  = isSubfolder ? `./${projectDir}/.tools/gitleaks/gitleaks`          : `./.tools/gitleaks/gitleaks`;
  const sonarBin     = isSubfolder ? `./${projectDir}/node_modules/.bin/sonar-scanner`    : `./node_modules/.bin/sonar-scanner`;
  const sonarProps   = isSubfolder ? `./${projectDir}/sonar-project.properties`           : `./sonar-project.properties`;

  return `#!/bin/sh

# secure-husky-setup pre-commit hook
# Runs from git root. projectDir=${projectDir}

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
  echo "No changed files detected. Skipping checks."
  exit 0
fi

echo "[Git Diff] Changed files in this commit:"
echo "$STAGED_FILES" | while IFS= read -r FILE; do
  echo "  -> $FILE"
done

echo ""
echo "[Gitleaks] Scanning changed files for secrets..."

GITLEAKS_BIN="${gitleaksBin}"

if [ ! -f "$GITLEAKS_BIN" ]; then
  echo "[Gitleaks] Binary not found. Skipping."
else
  GITLEAKS_TMPDIR=$(mktemp -d)

  echo "$STAGED_FILES" | while IFS= read -r FILE; do
    case "$FILE" in
      */sonar-project.properties) ;;
      */.tools/*) ;;
      sonar-project.properties) ;;
      .tools/*) ;;
      *)
        if [ -f "$FILE" ]; then
          DEST="$GITLEAKS_TMPDIR/$FILE"
          mkdir -p "$(dirname "$DEST")"
          cp "$FILE" "$DEST"
        fi
        ;;
    esac
  done

  $GITLEAKS_BIN detect --source "$GITLEAKS_TMPDIR" --no-git --verbose
  GITLEAKS_EXIT=$?
  rm -rf "$GITLEAKS_TMPDIR"

  if [ $GITLEAKS_EXIT -ne 0 ]; then
    echo "[Gitleaks] Secrets detected! Commit blocked."
    exit 1
  fi

  echo "[Gitleaks] No secrets found."
fi

echo ""
echo "[SonarQube] Scanning changed files..."

SONAR_BIN="${sonarBin}"
SONAR_PROPS="${sonarProps}"

if [ ! -f "$SONAR_BIN" ]; then
  echo "[SonarQube] sonar-scanner not found. Skipping."
elif [ ! -f "$SONAR_PROPS" ]; then
  echo "[SonarQube] sonar-project.properties not found. Skipping."
else
  SONAR_HOST=$(grep "^sonar.host.url=" "$SONAR_PROPS" | cut -d'=' -f2 | tr -d '[:space:]')
  SONAR_DOMAIN=$(echo "$SONAR_HOST" | sed 's|https://||' | sed 's|http://||' | cut -d'/' -f1 | cut -d':' -f1)
  SONAR_PORT=$(echo "$SONAR_HOST" | grep -o ':[0-9]*$' | tr -d ':')
  SONAR_PORT=\${SONAR_PORT:-9000}

  if ! nc -z -w3 "$SONAR_DOMAIN" "$SONAR_PORT" 2>/dev/null; then
    echo "[SonarQube] Server unreachable — skipping analysis."
  else
    SONAR_INCLUSIONS=$(echo "$STAGED_FILES" | tr '\\n' ',' | sed 's/,$//')
    echo "[SonarQube] Scanning: $SONAR_INCLUSIONS"

    # Run sonar-scanner in a subshell from project directory
    # so it correctly picks up sonar-project.properties
    (cd "${isSubfolder ? `./${projectDir}` : '.'}" && ./node_modules/.bin/sonar-scanner \\
      -Dsonar.inclusions="$SONAR_INCLUSIONS" \\
      -Dsonar.qualitygate.wait=true)
    SONAR_EXIT=$?

    if [ $SONAR_EXIT -ne 0 ]; then
      echo "[SonarQube] Quality Gate FAILED. Commit blocked."
      exit 1
    fi

    echo "[SonarQube] Quality Gate PASSED. ✔"
  fi
fi

exit 0
`;
}