const fs = require('fs');
const path = require('path');
const cwd = process.cwd();

if (JSON.parse(fs.readFileSync(path.join(cwd, './package.json')).toString()).name !== '@bettercorp/service-base')
  require('./lib/install.js');