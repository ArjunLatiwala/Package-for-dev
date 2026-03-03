const fs = require('fs-extra');
const path = require('path');
const execa = require('execa');
const https = require('https');
const { logInfo, logSuccess } = require('./logger');

const VERSION = "8.18.0";

exports.installGitleaks = async () => {
  const toolsDir = path.join(process.cwd(), '.tools');
  const gitleaksDir = path.join(toolsDir, 'gitleaks');
  const binaryPath = path.join(gitleaksDir, 'gitleaks');

  if (await fs.pathExists(binaryPath)) {
    logInfo("Gitleaks already installed locally.");
    return;
  }

  logInfo("Installing Gitleaks locally...");
  await fs.ensureDir(gitleaksDir);

  const url = `https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/gitleaks_${VERSION}_linux_x64.tar.gz`;
  const tarPath = path.join(gitleaksDir, 'gitleaks.tar.gz');

  await downloadFile(url, tarPath);

  await execa('tar', ['-xzf', tarPath, '-C', gitleaksDir]);

  await fs.remove(tarPath);
  await fs.chmod(binaryPath, 0o755);

  logSuccess("Gitleaks installed locally.");
};

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'node' } }, (response) => {

      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location, dest)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        return reject(new Error(`Download failed with status code ${response.statusCode}`));
      }

      const file = fs.createWriteStream(dest);
      response.pipe(file);

      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    });

    request.on('error', reject);
  });
}