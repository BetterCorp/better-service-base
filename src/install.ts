import { Tools } from "@bettercorp/tools/lib/Tools";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
let CWD = process.cwd();

console.log(`Install CWD: ${ CWD }`);

if (CWD.indexOf("@bettercorp") >= 0) {
  CWD = path.join(CWD, "../../../");
}

console.log(`INSTALL SCRIPT FOR @bettercorp/service-base in ${CWD}`);

const srcDir = path.join(CWD, `./src`);
if (!fs.existsSync(srcDir)) {
  console.log(`Creating src dir... (${srcDir})`);
  fs.mkdirSync(srcDir);
}

const pluginsDir = path.join(CWD, `./src/plugins`);
if (!fs.existsSync(pluginsDir)) {
  console.log(`Creating plugins dir... (${pluginsDir})`);
  fs.mkdirSync(pluginsDir);
}

const gitlabCISrcFile = path.join(CWD, `./node_modules/@bettercorp/service-base/build/gitlab-ci.yml`);
const gitlabCIFile = path.join(CWD, `./.gitlab-ci.yml`);
if (!fs.existsSync(gitlabCIFile) && fs.existsSync(gitlabCISrcFile)) {
  console.log(`Creating .gitlab-ci.yml build file... (${gitlabCISrcFile} -> ${gitlabCIFile})`);
  fs.copyFileSync(gitlabCISrcFile, gitlabCIFile);
}
const tsConfigSrcFile = path.join(CWD, `./node_modules/@bettercorp/service-base/tsconfig.json`);
const tsConfigFile = path.join(CWD, `./tsconfig.json`);
if (!fs.existsSync(tsConfigFile) && fs.existsSync(tsConfigSrcFile)) {
  console.log(`Creating tsConfig build file... (${tsConfigSrcFile} -> ${tsConfigFile})`);
  fs.copyFileSync(tsConfigSrcFile, tsConfigFile);
}
const tsLintSrcFile = path.join(CWD, `./node_modules/@bettercorp/service-base/tslint.json`);
const tsLintFile = path.join(CWD, `./tslint.json`);
if (!fs.existsSync(tsLintFile) && fs.existsSync(tsLintSrcFile)) {
  console.log(`Creating tslint build file... (${tsLintSrcFile} -> ${tsLintFile})`);
  fs.copyFileSync(tsLintSrcFile, tsLintFile);
}

const appScripts: any = {
  dev: "nodemon -L --watch src/**/*.ts --watch sec.config.json --exec ts-node node_modules/@bettercorp/service-base/lib/index.js",
  start: "ts-node node_modules/@bettercorp/service-base/lib/index.js",
  build: "tsc",
  create: "ts-node node_modules/@bettercorp/service-base/lib/bootstrap.js $0"
}
const internalAppScripts: any = {
  ...appScripts,
  version: "node ./node_modules/@bettercorp/service-base/build/version-internal.js $0"
}
const libScripts: any = {
  build: "tsc",
  //publish: "npm publish",
  version: "node ./node_modules/@bettercorp/service-base/build/version.js $0",
  create: "ts-node node_modules/@bettercorp/service-base/lib/bootstrap.js $0"
}

let coreAppInstall = false;
let libInstall = false;

const packaggeJSONFile = path.join(CWD, "./package.json");
if (fs.existsSync(packaggeJSONFile)) {
  let readPackageJsonFile = JSON.parse(fs.readFileSync(packaggeJSONFile).toString())

  if (readPackageJsonFile.name == "@bettercorp/service-base") {
    console.log("Self install. ignoring install script.");
    process.exit(0);
  }

  if (readPackageJsonFile.name.indexOf("@bettercorp/core-internal-") === 0)
    coreAppInstall = true;
  if (readPackageJsonFile.name.indexOf("@bettercorp/service-base") === 0)
    libInstall = true;

  let scripts = libScripts;
  if (coreAppInstall) {
    scripts = internalAppScripts;
  } else if (!libInstall) {
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
  if (readPackageJsonFile.scripts.publish !== undefined && readPackageJsonFile.scripts.publish.indexOf("npm publish") >= 0) {
    pakUpdates = true;
    if (readPackageJsonFile.scripts.publish == "npm publish")
      delete readPackageJsonFile.scripts.publish;
    else
      readPackageJsonFile.scripts.publish = `${readPackageJsonFile.scripts.publish}`.replace("npm publish", "");
  }
  if (typeof readPackageJsonFile.bsb_project !== "boolean") {
    readPackageJsonFile.bsb_project = true;
    pakUpdates = true;
  }
  if (pakUpdates) {
    console.log(`Updating package scripts for you... (${packaggeJSONFile})`);
    fs.writeFileSync(packaggeJSONFile, JSON.stringify(readPackageJsonFile))
  }

  if (libInstall) {
    console.log("Package install. ignoring app install script.");
    process.exit(0);
  }
}

const configFile = path.join(CWD, "./sec.config.json");
if (!fs.existsSync(configFile)) {
  console.log(`Creating config file... (${configFile})`);
  fs.writeFileSync(configFile, `{"identity":"${os.hostname}","debug":true,"deploymentProfiles": {"default":{}}, "plugins": {}}`);
} else {
  let tSec = JSON.parse(fs.readFileSync(configFile).toString());
  let tBefore = JSON.stringify(tSec);
  tSec.identity = tSec.identity || os.hostname;
  tSec.debug = tSec.debug || true;
  tSec.deploymentProfiles = tSec.deploymentProfiles || {};
  tSec.plugins = tSec.plugins || {};
  let tAfter = JSON.stringify(tSec);
  if (tBefore != tAfter)
    fs.writeFileSync(configFile, tAfter);
}
const installer = path.join(CWD, "./node_modules/@bettercorp/service-base/lib/ServiceBase.js");
console.log("INSTALL FINAL : AUTOLOAD: " + installer);
const ServiceBase = require(installer);
const SB = new ServiceBase.default(CWD);
SB.config().then(() => console.log("INSTALL COMPLETE FOR @bettercorp/service-base")).catch(() => process.exit(1));