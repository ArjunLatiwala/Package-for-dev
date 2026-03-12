const fs = require('fs-extra');
const path = require('path');
const execa = require('execa');
const https = require('https');
const { logInfo, logSuccess } = require('./logger');

const VERSION = "8.18.0";

// Added by Arjun — detect the correct gitleaks binary for the current OS and architecture
function getPlatformAsset() {
  const platform = process.platform;
  const arch = process.arch;

  const archMap = {
    x64:   'x64',
    arm64: 'arm64',
    arm:   'armv7',
  };

  const gitleaksArch = archMap[arch] || 'x64';

  if (platform === 'darwin') {
    return { filename: `gitleaks_${VERSION}_darwin_${gitleaksArch}.tar.gz`, extract: 'tar' };
  }

  if (platform === 'win32') {
    return { filename: `gitleaks_${VERSION}_windows_${gitleaksArch}.zip`, extract: 'zip' };
  }

  return { filename: `gitleaks_${VERSION}_linux_${gitleaksArch}.tar.gz`, extract: 'tar' };
}

// Added by Arjun — automatically add entries to .gitignore if missing
async function ensureGitignoreEntries(entries) {
  const gitignorePath = path.join(process.cwd(), '.gitignore');

  let content = '';
  if (await fs.pathExists(gitignorePath)) {
    content = await fs.readFile(gitignorePath, 'utf-8');
  }

  const added = [];
  for (const entry of entries) {
    if (!content.includes(entry)) {
      content += `\n${entry}`;
      added.push(entry);
    }
  }

  if (added.length > 0) {
    await fs.writeFile(gitignorePath, content);
    logInfo(`.gitignore updated — added: ${added.join(', ')}`);
  }
}

exports.installGitleaks = async () => {
  const toolsDir    = path.join(process.cwd(), '.tools');
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

  // Added by Arjun — automatically add .tools/ and node_modules/ to .gitignore
  // .tools/       → prevents gitleaks binary from being staged and scanned
  // node_modules/ → prevents dependencies from being committed to git
  await ensureGitignoreEntries(['.tools/', 'node_modules/']);

  logSuccess("Gitleaks installed locally.");
};

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'node' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
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