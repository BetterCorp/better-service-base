const fs = require('fs');
const path = require('path');
const cwd = process.cwd();

if (fs.existsSync(path.join(cwd, './.bsb.local'))) {
  console.log('BSB Post Install: Ignore');
} else {
  console.log('BSB Post Install: Run');
  if (cwd.indexOf('/node_modules/') > 0) {
    console.log('BSB Post Install: Bypass - we`re in node_modules dir.')
    process.exit(0);
  }
  const installer = require(path.join(cwd, './lib/install.js')).default;
  console.log(fs.readdirSync('./build/'))
  installer(path.join(cwd, '../../../'));
  console.log('BSB Post Install: Complete');
}