#!/usr/bin/env node
const { installHusky } = require('../lib/husky');
const { installGitleaks } = require('../lib/gitleaks');
const { installSonarScanner, setupSonarProperties } = require('../lib/sonarqube');
const { setupPreCommitHook } = require('../lib/hooks');
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

    const { found, gitRoot, projectRoot } = await isGitRepo();

    if (!found) {
      throw new Error("Not inside a git repository. Please run 'git init' first.");
    }

    if (gitRoot !== projectRoot) {
      logInfo(`Git root detected at: ${gitRoot}`);
      logInfo(`Project root (package.json): ${projectRoot}`);
      logInfo(`Monorepo/subfolder setup detected — hooks installed at git root, config at project root.`);
    }

    // ── Pre-commit hooks ──────────────────────────────────────────────────────
    await installHusky(gitRoot);
    await installGitleaks();
    await installSonarScanner();
    await setupSonarProperties();
    await setupPreCommitHook(gitRoot);

    logSuccess("Secure Husky + Gitleaks + SonarQube setup completed.");
    logInfo("Next step: edit sonar-project.properties and set sonar.host.url and sonar.token.");

    // ── Pre-push hook + GitHub Actions CI workflow ────────────────────────────
    logInfo("Setting up Newman & Smoke Test CI workflow...");

    await ensurePackageLock();
    await validateProject();
    await setupCIScript(gitRoot);
    await setupCIWorkflow();
    await setupPrePushHook(gitRoot);

    logSuccess("Newman + Smoke Test pre-push hook and GitHub Actions workflow setup completed.");

  } catch (err) {
    logError(err.message);
    process.exit(1);
  }
})();