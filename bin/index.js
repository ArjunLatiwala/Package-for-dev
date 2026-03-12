#!/usr/bin/env node
const { installHusky } = require('../lib/husky');
const { installGitleaks } = require('../lib/gitleaks');
const { installSonarScanner, setupSonarProperties } = require('../lib/sonarqube');
const { setupPreCommitHook } = require('../lib/hooks');
// Added by Arjun — import CI setup functions from the new lib/ci.js module
const { setupPrePushHook, setupCIScript, setupCIWorkflow, validateProject, ensurePackageLock } = require('../lib/ci');
const { isGitRepo } = require('../lib/git');
const { logInfo, logError, logSuccess } = require('../lib/logger');

const command = process.argv[2];

(async () => {
  if (command !== 'init') {
    console.log("Usage: secure-husky-setup init");
    process.exit(0);
  }

  try {
    logInfo("Initializing secure git hooks...");

    if (!await isGitRepo()) {
      throw new Error("Not inside a git repository.");
    }

    // ── Existing steps — pre-commit hooks (no changes made here) ─────────────
    await installHusky();
    await installGitleaks();
    await installSonarScanner();
    await setupSonarProperties();
    await setupPreCommitHook();

    logSuccess("Secure Husky + Gitleaks + SonarQube setup completed.");
    logInfo("Next step: edit sonar-project.properties and set sonar.host.url and sonar.token.");

    // Added by Arjun — pre-push hook + GitHub Actions CI workflow setup ───────
    // Runs Newman API tests and smoke tests automatically on every git push
    logInfo("Setting up Newman & Smoke Test CI workflow...");

    // Added by Arjun — ensure package-lock.json exists (required by npm ci in workflow)
    await ensurePackageLock();

    // Added by Arjun — validate package.json has "start" and "test" scripts
    await validateProject();

    // Added by Arjun — write standalone scripts/run-ci-checks.sh (all test logic lives here)
    await setupCIScript();

    // Added by Arjun — copy ci-tests.yml into .github/workflows/
    await setupCIWorkflow();

    // Added by Arjun — create .husky/pre-push hook (thin wrapper that calls run-ci-checks.sh)
    await setupPrePushHook();

    logSuccess("Newman + Smoke Test pre-push hook and GitHub Actions workflow setup completed.");
    // ── End of Arjun's additions ──────────────────────────────────────────────

  } catch (err) {
    logError(err.message);
    process.exit(1);
  }
})();