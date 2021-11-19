import { Tools } from "@bettercorp/tools/lib/Tools";
import * as fs from "fs";
import * as crypto from "crypto";
import * as path from "path";
import * as os from "os";
let CWD = process.cwd();

console.log(`Install CWD: ${ CWD }`);

if (CWD.indexOf("@bettercorp") >= 0) {
  CWD = path.join(CWD, "../../../");
}

console.log(`INSTALL SCRIPT FOR @bettercorp/service-base in ${ CWD }`);

const srcDir = path.join(CWD, `./src`);
if (!fs.existsSync(srcDir)) {
  console.log(`Creating src dir... (${ srcDir })`);
  fs.mkdirSync(srcDir);
}

const pluginsDir = path.join(CWD, `./src/plugins`);
if (!fs.existsSync(pluginsDir)) {
  console.log(`Creating plugins dir... (${ pluginsDir })`);
  fs.mkdirSync(pluginsDir);
}

const filesToCopyToDest = [
  {
    src: path.join(CWD, './node_modules/@bettercorp/service-base/build/gitlab-ci.yml'),
    dst: path.join(CWD, './.gitlab-ci.yml'),
    name: 'gitlab-ci'
  },
  {
    src: path.join(CWD, './node_modules/@bettercorp/service-base/build/.eslintignore'),
    dst: path.join(CWD, './.eslintignore'),
    name: 'eslintignore'
  },
  {
    src: path.join(CWD, './node_modules/@bettercorp/service-base/build/.eslintrc.js'),
    dst: path.join(CWD, './.eslintrc.js'),
    name: 'eslintrc'
  },
  {
    src: path.join(CWD, './node_modules/@bettercorp/service-base/build/tsconfig.json'),
    dst: path.join(CWD, './tsconfig.json'),
    name: 'tsconfig'
  },

  // old build files
  {
    dst: path.join(CWD, './tslint.json'),
    remove: true
  }
];

for (const fileInfo of filesToCopyToDest) {
  if (fileInfo.remove === true) {
    if (fs.existsSync(fileInfo.dst))
      fs.unlinkSync(fileInfo.dst);
  } else {
    if (!fs.existsSync(fileInfo.dst)) {
      console.log(`Creating ${ fileInfo.name } build file... (${ fileInfo.src } -> ${ fileInfo.dst })`);
      fs.copyFileSync(fileInfo.src!, fileInfo.dst!);
    }
    const srcBuffer = fs.readFileSync(fileInfo.src!);
    const srcHash = crypto.createHash('sha256');
    srcHash.update(srcBuffer);
    const dstBuffer = fs.readFileSync(fileInfo.dst!);
    const dstHash = crypto.createHash('sha256');
    dstHash.update(dstBuffer);
    if (srcHash.digest('hex') !== dstHash.digest('hex')) {
      console.log(`Updating ${ fileInfo.name } build file... (${ fileInfo.src } -> ${ fileInfo.dst })`);
      fs.copyFileSync(fileInfo.src!, fileInfo.dst!);
    }
  }
}

const defaultScripts: any = {
  build: "tsc",
  dev: "nodemon -L --watch src/**/*.ts --watch sec.config.json --exec ts-node node_modules/@bettercorp/service-base/lib/index.js",
  start: "ts-node node_modules/@bettercorp/service-base/lib/index.js",
  create: "ts-node node_modules/@bettercorp/service-base/lib/bootstrap.js $0",
  version: "node ./node_modules/@bettercorp/service-base/build/version-ci.js $0",
};
const internalAppScripts: any = {
  ...defaultScripts,
  version: "node ./node_modules/@bettercorp/service-base/build/version-internal.js $0"
};
const bcorpLibScripts: any = {
  ...defaultScripts,
  version: "node ./node_modules/@bettercorp/service-base/build/version-bcorp.js $0"
};

let coreAppInstall = false;
let libInstall = false;
let selfInstall = false;

const packaggeJSONFile = path.join(CWD, "./package.json");
let todoList: Array<string> = [];
if (fs.existsSync(packaggeJSONFile)) {
  const readPackageJsonFile = JSON.parse(fs.readFileSync(packaggeJSONFile).toString());

  const arrOfDevDepts = Object.keys(readPackageJsonFile.devDependencies || {});
  let paksToRemove: Array<string> = ['tslint'];
  let devPaksToInstall: Array<string> = ['eslint', 'typescript', '@typescript-eslint/parser', '@typescript-eslint/eslint-plugin'];
  for (let i = paksToRemove.length - 1; i >= 0; i--)
    if (arrOfDevDepts.indexOf(paksToRemove[i]) < 0) {
      paksToRemove.splice(i, 1);
    }
  for (let i = devPaksToInstall.length - 1; i >= 0; i--)
    if (arrOfDevDepts.indexOf(devPaksToInstall[i]) >= 0) {
      devPaksToInstall.splice(i, 1);
    }

  if (paksToRemove.length > 0 || devPaksToInstall.length > 0) {
    todoList.push('You are missing some packages / have depreciated ones. Please run the following commands to clean things up:');
    if (paksToRemove.length > 0)
      todoList.push(`npm remove ${ paksToRemove.join(' ') }`);
    if (devPaksToInstall.length > 0)
      todoList.push(`npm install --save-dev ${ devPaksToInstall.join(' ') }`);
  }

  if (readPackageJsonFile.name == "@bettercorp/service-base") {
    console.log("Self install. ignoring install script.");
    process.exit(0);
  }

  if (readPackageJsonFile.name.indexOf("@bettercorp/core-internal-") === 0)
    coreAppInstall = true;
  if (readPackageJsonFile.name.indexOf("@bettercorp/service-base-") === 0)
    libInstall = true;
  if (readPackageJsonFile.name === "@bettercorp/service-base")
    selfInstall = true;

  let scripts = defaultScripts;
  if (coreAppInstall) {
    scripts = internalAppScripts;
  } else if (libInstall) {
    scripts = bcorpLibScripts;
  }
  if (Tools.isNullOrUndefined(readPackageJsonFile.scripts)) {
    readPackageJsonFile.scripts = {};
  }
  let pakUpdates = false;
  for (const key of Object.keys(scripts)) {
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
      readPackageJsonFile.scripts.publish = `${ readPackageJsonFile.scripts.publish }`.replace("npm publish", "");
  }
  if (typeof readPackageJsonFile.bsb_project !== "boolean") {
    readPackageJsonFile.bsb_project = true;
    pakUpdates = true;
  }
  if (pakUpdates) {
    console.log(`Updating package scripts for you... (${ packaggeJSONFile })`);
    fs.writeFileSync(packaggeJSONFile, JSON.stringify(readPackageJsonFile));
  }

  if (selfInstall) {
    console.log("Package install. ignoring app install script.");
    process.exit(0);
  }
}

const configFile = path.join(CWD, "./sec.config.json");
if (!fs.existsSync(configFile)) {
  console.log(`Creating config file... (${ configFile })`);
  fs.writeFileSync(configFile, `{"identity":"${ os.hostname }","debug":true,"deploymentProfiles": {"default":{}}, "plugins": {}}`);
} else {
  const tSec = JSON.parse(fs.readFileSync(configFile).toString());
  const tBefore = JSON.stringify(tSec);
  tSec.identity = tSec.identity || os.hostname;
  tSec.debug = tSec.debug || true;
  tSec.deploymentProfiles = tSec.deploymentProfiles || {};
  tSec.plugins = tSec.plugins || {};
  const tAfter = JSON.stringify(tSec);
  if (tBefore != tAfter)
    fs.writeFileSync(configFile, tAfter);
}
const installer = path.join(CWD, "./node_modules/@bettercorp/service-base/lib/ServiceBase.js");
console.log("INSTALL FINAL : AUTOLOAD: " + installer);
const ServiceBase = require(installer); // eslint-disable-line @typescript-eslint/no-var-requires
const SB = new ServiceBase.default(CWD);
SB.config().then(() => {
  console.log("INSTALL COMPLETE FOR @bettercorp/service-base");

  console.log("");
  console.log("");
  console.log("");

  for (const todoItem of todoList) console.warn(todoItem);
}).catch(() => process.exit(1));