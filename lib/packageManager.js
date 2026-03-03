const execa = require('execa');

exports.installDevDependency = async (pkg) => {
  await execa('npm', ['install', pkg, '--save-dev'], { stdio: 'inherit' });
};
