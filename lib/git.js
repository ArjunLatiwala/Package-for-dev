const fs = require('fs');
const path = require('path');

// Returns { found, gitRoot, projectRoot }
// gitRoot  = where .git folder is (where husky installs)
// projectRoot = where package.json is (where scripts/sonar/gitleaks live)
exports.isGitRepo = async () => {
  const projectRoot = process.cwd();
  let dir = projectRoot;

  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      return { found: true, gitRoot: dir, projectRoot };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { found: false, gitRoot: null, projectRoot };
};