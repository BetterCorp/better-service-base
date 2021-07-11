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

/*const dockerDir = PATH.join(CWD, `./docker`);
if (!FS.existsSync(dockerDir)) {
  console.log(`Creating docker dir... (${dockerDir})`);
  FS.mkdirSync(dockerDir);
}
const dockerSrcFile = PATH.join(CWD, `./node_modules/@bettercorp/service-base/docker/DockerFile`);
const dockerFile = PATH.join(dockerDir, `./DockerFile`);
if (FS.existsSync(dockerSrcFile)) {
  console.log(`Creating docker build file... (${dockerSrcFile} -> ${dockerFile})`);
  FS.copyFileSync(dockerSrcFile, dockerFile)
}*/

const gitlabCISrcFile = PATH.join(CWD, `./node_modules/@bettercorp/service-base/build/gitlab-ci.yml`);
const gitlabCIFile = PATH.join(CWD, `./.gitlab-ci.yml`);
if (!FS.existsSync(gitlabCIFile) && FS.existsSync(gitlabCISrcFile)) {
  console.log(`Creating .gitlab-ci.yml build file... (${gitlabCISrcFile} -> ${gitlabCIFile})`);
  FS.copyFileSync(gitlabCISrcFile, gitlabCIFile)
}
const tsConfigSrcFile = PATH.join(CWD, `./node_modules/@bettercorp/service-base/tsconfig.json`);
const tsConfigFile = PATH.join(CWD, `./tsconfig.json`);
if (!FS.existsSync(tsConfigFile) && FS.existsSync(tsConfigSrcFile)) {
  console.log(`Creating tsConfig build file... (${tsConfigSrcFile} -> ${tsConfigFile})`);
  FS.copyFileSync(tsConfigSrcFile, tsConfigFile)
}
const tsLintSrcFile = PATH.join(CWD, `./node_modules/@bettercorp/service-base/tslint.json`);
const tsLintFile = PATH.join(CWD, `./tslint.json`);
if (!FS.existsSync(tsLintFile) && FS.existsSync(tsLintSrcFile)) {
  console.log(`Creating tslint build file... (${tsLintSrcFile} -> ${tsLintFile})`);
  FS.copyFileSync(tsLintSrcFile, tsLintFile)
}

const appScripts = {
  dev: "nodemon -L --watch src/**/*.ts --watch plugins/**/*.ts --watch sec.config.json --exec ts-node src/index.ts",
  start: "node lib/index.js",
  build: "tsc",
  //publish: "npm publish",
  version: "node ./node_modules/@bettercorp/service-base/build/version.js $0"
}
const libScripts = {
  build: "tsc",
  //publish: "npm publish",
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
  if (readPackageJsonFile.scripts.publish !== undefined && readPackageJsonFile.scripts.publish.indexOf('npm publish') >= 0) {
    pakUpdates = true;
    if (readPackageJsonFile.scripts.publish == 'npm publish')
      delete readPackageJsonFile.scripts.publish;
    else
      readPackageJsonFile.scripts.publish = `${readPackageJsonFile.scripts.publish}`.replace('npm publish', '');
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

const srcIndex = PATH.join(CWD, `./src/index.ts`);
if (!FS.existsSync(srcIndex)) {
  console.log(`Creating Main index file... (${srcIndex})`);
  const indexSrcFile = PATH.join(CWD, `./node_modules/@bettercorp/service-base/sourceFiles/index.ts.src`);
  const indexFile = PATH.join(CWD, `./index.ts`);
  if (!FS.existsSync(indexFile) && FS.existsSync(indexSrcFile)) {
    console.log(`Creating src/index.ts build file... (${indexSrcFile} -> ${indexFile})`);
    FS.copyFileSync(indexSrcFile, indexFile)
  }
}

console.log('INSTALL COMPLETE FOR @bettercorp/service-base');

console.log('PERFORMING PLUGIN INSTALL WITH IN-BUILT PLUGINS');
require('./install-plugin');