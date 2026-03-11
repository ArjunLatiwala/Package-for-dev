const fs = require('fs-extra');
const path = require('path');
const execa = require('execa');
const https = require('https');
const { logInfo, logSuccess } = require('./logger');

const VERSION = "8.18.0";

// Added by Arjun — detect the correct gitleaks binary for the current OS and architecture
function getPlatformAsset() {
  const platform = process.platform; // 'darwin', 'linux', 'win32'
  const arch = process.arch;         // 'x64', 'arm64'

  // Map Node.js arch to gitleaks arch naming
  const archMap = {
    x64:   'x64',
    arm64: 'arm64',
    arm:   'armv7',
  };

  const gitleaksArch = archMap[arch] || 'x64';

  if (platform === 'darwin') {
    // macOS — available as .tar.gz
    return {
      filename: `gitleaks_${VERSION}_darwin_${gitleaksArch}.tar.gz`,
      extract: 'tar',
    };
  }

  if (platform === 'win32') {
    // Windows — available as .zip
    return {
      filename: `gitleaks_${VERSION}_windows_${gitleaksArch}.zip`,
      extract: 'zip',
    };
  }

  // Default: Linux
  return {
    filename: `gitleaks_${VERSION}_linux_${gitleaksArch}.tar.gz`,
    extract: 'tar',
  };
}

exports.installGitleaks = async () => {
  const toolsDir   = path.join(process.cwd(), '.tools');
  const gitleaksDir = path.join(toolsDir, 'gitleaks');
  const binaryPath  = path.join(gitleaksDir, 'gitleaks');

  if (await fs.pathExists(binaryPath)) {
    logInfo("Gitleaks already installed locally.");
    return;
  }

  logInfo("Installing Gitleaks locally...");
  await fs.ensureDir(gitleaksDir);

  // Added by Arjun — use platform-aware asset instead of hardcoded linux_x64
  const { filename, extract } = getPlatformAsset();
  const url      = `https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/${filename}`;
  const destPath = path.join(gitleaksDir, filename);

  logInfo(`Downloading ${filename}...`);
  await downloadFile(url, destPath);

  // Added by Arjun — handle both tar.gz (mac/linux) and zip (windows)
  if (extract === 'tar') {
    await execa('tar', ['-xzf', destPath, '-C', gitleaksDir]);
  } else {
    await execa('unzip', ['-o', destPath, '-d', gitleaksDir]);
  }

  await fs.remove(destPath);
  await fs.chmod(binaryPath, 0o755);

  // Added by Arjun — automatically add .tools/ to .gitignore
  // so the gitleaks binary never gets staged or scanned
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  const ignoreEntry = '.tools/';
  if (await fs.pathExists(gitignorePath)) {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    if (!content.includes(ignoreEntry)) {
      await fs.appendFile(gitignorePath, `\n${ignoreEntry}\n`);
      logInfo(".tools/ added to .gitignore.");
    }
  } else {
    await fs.writeFile(gitignorePath, `${ignoreEntry}\n`);
    logInfo(".gitignore created with .tools/ entry.");
  }

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