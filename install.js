const {
  Tools
} = require('@bettercorp/tools/lib/Tools');
const FS = require('fs');
const PATH = require('path');
let CWD = process.cwd();

console.log(`Install CWD: ${CWD}`)

if (CWD.indexOf('@bettercorp') >= 0) {
  CWD = PATH.join(CWD, '../../../');
}

console.log(`INSTALL SCRIPT FOR @bettercorp/service-base in ${CWD}`);

const srcDir = PATH.join(CWD, `./src`);
if (!FS.existsSync(srcDir)) {
  console.log(`Creating src dir... (${srcDir})`);
  FS.mkdirSync(srcDir);
}

const pluginsDir = PATH.join(CWD, `./src/plugins`);
if (!FS.existsSync(pluginsDir)) {
  console.log(`Creating plugins dir... (${pluginsDir})`);
  FS.mkdirSync(pluginsDir);
}

const dockerDir = PATH.join(CWD, `./docker`);
if (!FS.existsSync(dockerDir)) {
  console.log(`Creating docker dir... (${dockerDir})`);
  FS.mkdirSync(dockerDir);
}
const dockerSrcFile = PATH.join(CWD, `./node_modules/@bettercorp/service-base/docker/DockerFile`);
const dockerFile = PATH.join(dockerDir, `./DockerFile`);
if (!FS.existsSync(dockerFile) && FS.existsSync(dockerSrcFile)) {
  console.log(`Creating docker build file... (${dockerSrcFile} -> ${dockerFile})`);
  FS.copyFileSync(dockerSrcFile, dockerFile)
}

const isTS = FS.existsSync(PATH.join(CWD, './tsconfig.json'));

const appScripts = {
  dev: "nodemon -L --watch src/**/*.ts --watch plugins/**/*.ts --watch sec.config.json --exec ts-node src/index.ts",
  start: "node lib/index.js",
  build: isTS ? "tsc" : undefined,
  publish: "npm publish",
  version: "node ./node_modules/@bettercorp/service-base/build/version.js $0"
}
const libScripts = {
  build: isTS ? "tsc" : undefined,
  publish: "npm publish",
  version: "node ./node_modules/@bettercorp/service-base/build/version.js $0"
}

let libInstall = false;

const packaggeJSONFile = PATH.join(CWD, './package.json');
if (FS.existsSync(packaggeJSONFile)) {
  let readPackageJsonFile = JSON.parse(FS.readFileSync(packaggeJSONFile).toString())

  if (readPackageJsonFile.name == '@bettercorp/service-base')
    return console.log('Self install. ignoring install script.');

  if (readPackageJsonFile.name.indexOf('@bettercorp/service-base') === 0)
    libInstall = true;

  let scripts = libScripts;
  if (!libInstall) {
    scripts = appScripts;
  }
  if (Tools.isNullOrUndefined(readPackageJsonFile.scripts)) {
    readPackageJsonFile.scripts = {};
  }
  let pakUpdates = false;
  for (let key of Object.keys(scripts)) {
    if (Tools.isNullOrUndefined(scripts[key])) continue;

    if (readPackageJsonFile.scripts[key] !== scripts[key]) {
      readPackageJsonFile.scripts[key] = scripts[key];
      pakUpdates = true;
    }
  }
  if (Tools.isNullOrUndefined(readPackageJsonFile.files)) {
    readPackageJsonFile.files = ["lib/**/*"];
    pakUpdates = true;
  }
  if (pakUpdates) {
    console.log(`Updating package scripts for you... (${packaggeJSONFile})`);
    FS.writeFileSync(packaggeJSONFile, JSON.stringify(readPackageJsonFile))
  }

  if (libInstall) {
    return console.log('Package install. ignoring app install script.');
  }
}

const configFile = PATH.join(CWD, './sec.config.json');
if (!FS.existsSync(configFile)) {
  console.log(`Creating config file... (${configFile})`);
  FS.writeFileSync(configFile, '{"enabledPlugins": {}, "plugins": {}, "mappedPlugins": {}}');
}

const srcIndex = PATH.join(CWD, `./src/index.${isTS ? 'ts' : 'js'}`);
if (!FS.existsSync(srcIndex)) {
  console.log(`Creating Main index file... (${srcIndex})`);
  FS.writeFileSync(srcIndex, isTS ?
    "import ServiceBase from '@bettercorp/service-base';\n\n" +
    "const SB = new ServiceBase();\n" +
    "SB.init();\n" +
    "SB.run();" :
    'const ServiceBase = require("@bettercorp/service-base");\n\n' +
    "const SB = new (ServiceBase.default || ServiceBase)();\n" +
    "SB.init();\n" +
    "SB.run();");
}

console.log('INSTALL COMPLETE FOR @bettercorp/service-base');

console.log('PERFORMING PLUGIN INSTALL WITH IN-BUILT PLUGINS');
require('./install-plugin');