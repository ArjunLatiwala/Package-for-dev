const { fileExists, readJSON, writeJSON } = require('./utils');
const { installDevDependency } = require('./packageManager');
const execa = require('execa');
const path = require('path');
const fs = require('fs-extra');
const { logInfo, logSuccess } = require('./logger');

exports.installHusky = async () => {
  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkg = await readJSON(pkgPath);

  if (!pkg.devDependencies || !pkg.devDependencies.husky) {
    logInfo("Installing Husky...");
    await installDevDependency('husky');
  }

  logInfo("Initializing Husky...");
  await execa('npx', ['husky', 'install'], { stdio: 'inherit' });

  if (!pkg.scripts) pkg.scripts = {};

  if (!pkg.scripts.prepare) {
    pkg.scripts.prepare = "husky install";
    await writeJSON(pkgPath, pkg);
    logSuccess("Added prepare script.");
  }
};
