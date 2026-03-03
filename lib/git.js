const fs = require('fs');
const path = require('path');

exports.isGitRepo = async () => {
  const gitPath = path.join(process.cwd(), '.git');
  return fs.existsSync(gitPath);
};