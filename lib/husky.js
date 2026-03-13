const { readJSON, writeJSON } = require('./utils');
const { installDevDependency } = require('./packageManager');
const execa = require('execa');
const path = require('path');
const fs = require('fs-extra');
const { logInfo, logSuccess, logError } = require('./logger');

exports.installHusky = async (gitRoot) => {
  const pkgPath = path.join(process.cwd(), 'package.json');

  if (!await fs.pathExists(pkgPath)) {
    throw new Error(`No package.json found in ${process.cwd()}. Please run from your project root.`);
  }

  const pkg = await readJSON(pkgPath);

  if (!pkg.devDependencies || !pkg.devDependencies.husky) {
    logInfo("Installing Husky...");
    await installDevDependency('husky');
  }

  logInfo("Initializing Husky...");

  // Always run husky install from the git root — this is where .husky/ is created
  await execa('npx', ['husky', 'install'], { stdio: 'inherit', cwd: gitRoot });

  // Add prepare script to the project's package.json
  // If project is a subfolder, prepare script needs to reference path to git root
  if (!pkg.scripts) pkg.scripts = {};
  if (!pkg.scripts.prepare) {
    const isSubfolder = gitRoot !== process.cwd();
    if (isSubfolder) {
      // Calculate relative path from project root to git root for husky install
      const relPath = path.relative(process.cwd(), gitRoot);
      pkg.scripts.prepare = `cd ${relPath} && husky install ${path.relative(gitRoot, process.cwd())}/.husky || true`;
    } else {
      pkg.scripts.prepare = "husky install";
    }
    await writeJSON(pkgPath, pkg);
    logSuccess("Added prepare script.");
  }
};