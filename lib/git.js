const fs = require('fs');
const path = require('path');

exports.isGitRepo = async () => {
  // Walk up directory tree to find .git folder
  // This handles postinstall where cwd() is inside node_modules/package-name
  let dir = process.cwd();

  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      // Change working directory to the project root
      process.chdir(dir);
      return true;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  return false;
};