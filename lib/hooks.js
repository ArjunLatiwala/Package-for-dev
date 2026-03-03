const fs = require('fs-extra');
const path = require('path');
const { logInfo, logSuccess } = require('./logger');

exports.setupPreCommitHook = async () => {
  const huskyDir = path.join(process.cwd(), '.husky');
  const hookPath = path.join(huskyDir, 'pre-commit');

  const gitleaksCommand = './.tools/gitleaks/gitleaks detect --source . --no-git --verbose';

  if (!await fs.pathExists(huskyDir)) {
    logInfo("Husky directory not found. Skipping hook setup.");
    return;
  }

  if (await fs.pathExists(hookPath)) {
    let content = await fs.readFile(hookPath, 'utf-8');

    if (content.includes('gitleaks')) {
      logInfo("Gitleaks already configured in pre-commit.");
      return;
    }

    logInfo("Appending Gitleaks to existing pre-commit hook...");
    content += `\n${gitleaksCommand}\n`;
    await fs.writeFile(hookPath, content);
    await fs.chmod(hookPath, 0o755);

    logSuccess("Gitleaks appended to pre-commit hook.");
  } else {
    logInfo("Creating new pre-commit hook...");

    const hookContent = `#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

${gitleaksCommand}
`;

    await fs.writeFile(hookPath, hookContent);
    await fs.chmod(hookPath, 0o755);

    logSuccess("Pre-commit hook created with Gitleaks.");
  }
};
