#!/usr/bin/env node

const { installHusky } = require('../lib/husky');
const { installGitleaks } = require('../lib/gitleaks');
const { installSonarScanner, setupSonarProperties } = require('../lib/sonarqube');
const { setupPreCommitHook } = require('../lib/hooks');
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

    await installHusky();
    await installGitleaks();
    await installSonarScanner();
    await setupSonarProperties();
    await setupPreCommitHook();

    logSuccess("Secure Husky + Gitleaks + SonarQube setup completed.");
    logInfo("Next step: edit sonar-project.properties and set sonar.host.url and sonar.token.");
  } catch (err) {
    logError(err.message);
    process.exit(1);
  }
})();