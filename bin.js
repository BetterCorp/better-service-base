#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import child_process from "child_process";
//import fse from "fs-extra";
import axios from "axios";
import inquirer from "inquirer";
import yargs from "yargs";

const cwd = process.cwd();

const packageJsonFile = path.join(cwd, "./package.json");
const secJsonFile = path.join(cwd, "./sec.config.json");

console.log(`Welcome to Better-Service-Base Client!`);
console.log();
console.log("Working in: " + cwd);
console.log();
console.log();

let defArgv = process.argv.slice(2);
if (defArgv.length < 1) defArgv = ["-h"];
//if (defArgv.length < 2) defArgv.push("-h");

const defaultFunctions = {
  syncDependencies: async () => {
    const packagesToInstall = [
      "@bettercorp/tools@latest",
      "@bettercorp/service-base@latest",
    ];
    const devPackagesToInstall = [
      "@types/assert",
      "@types/chai",
      "@types/mocha",
      "@types/node",
      "@typescript-eslint/eslint-plugin",
      "@typescript-eslint/parser",
      "eslint",
      "mocha",
      "nyc",
      "ts-node",
      "typescript",
    ];
    console.log("Cleaning dependencies");
    child_process.execSync(
      `npm remove ${devPackagesToInstall.join(" ")} ${packagesToInstall.join(
        " "
      )}`,
      {
        encoding: "utf8",
        cwd: cwd,
      }
    );
    console.log("Installing dependencies");
    child_process.execSync(
      `npm i --save-dev ${devPackagesToInstall.join(
        " "
      )} && npm i --save ${packagesToInstall.join(" ")}`,
      {
        encoding: "utf8",
        cwd: cwd,
      }
    );
  },
  syncCoreFiles: async () => {
    const bsbPath =
      "https://raw.githubusercontent.com/BetterCorp/better-service-base/master/nodejs/build/";
    const filesToCopyAcross = [
      { src: "tsconfig.json", dst: "tsconfig.json", canOverwrite: true },
      { src: "eslintrc.js", dst: ".eslintrc.js", canOverwrite: true },
      { src: "eslintignore", dst: ".eslintignore", canOverwrite: true },
    ];
    for (const file of filesToCopyAcross) {
      console.log(`Checking ${file.dst}`);
      const dstFile = path.join(cwd, file.dst);
      const dstFileTemp = path.join(cwd, file.dst + ".tmp");
      let existingFile = fs.existsSync(dstFile);
      if (existingFile) {
        if (!file.canOverwrite) {
          continue;
        }
      }
      console.log(`Copying ${file.src}=>${file.dst}`);
      const fileResp = await axios.get(`${bsbPath}${file.src}`, {
        responseType: "stream",
      });
      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(
          existingFile ? (file.canOverwrite ? dstFile : dstFileTemp) : dstFile
        );
        if (existingFile && !file.canOverwrite)
          console.warn(
            "we have created a new file for you to merge the changes (.tmp)"
          );
        fileResp.data.pipe(writer);
        let error = null;
        writer.on("error", (err) => {
          error = err;
          writer.close();
          reject(err);
        });
        writer.on("close", () => {
          if (!error) {
            resolve(true);
          }
        });
      });
    }
    if (!fs.existsSync(path.join(cwd, "./src")))
      fs.mkdirSync(path.join(cwd, "./src"));
    if (!fs.existsSync(path.join(cwd, "./src/clients")))
      fs.mkdirSync(path.join(cwd, "./src/clients"));
    if (!fs.existsSync(path.join(cwd, "./src/plugins")))
      fs.mkdirSync(path.join(cwd, "./src/plugins"));
    if (!fs.existsSync(path.join(cwd, "./src/shared")))
      fs.mkdirSync(path.join(cwd, "./src/shared"));
  },
  setupFiles: (packageJSON) => {
    const defaultFiles = ["lib/**/*"];

    console.warn("Updating output files");
    packageJSON.files = packageJSON.files ?? [];
    for (let dFile of defaultFiles) {
      console.log(` - Checking file: ${dFile}`);
      if (packageJSON.files.indexOf(dFile) < 0) {
        console.log(` ^ Adding file: ${dFile}`);
        packageJSON.files.push(dFile);
      }
    }

    return packageJSON;
  },
  setupScripts: (packageJSON) => {
    const defaultScripts = {
      build: "npm run build-plugin && npm run build-clients",
      "build-plugin": "rm -rfv ./lib && tsc",
      "build-clients":
        "node node_modules/@bettercorp/service-base/build-lib-clients.js",
      dev: "nodemon --config node_modules/@bettercorp/service-base/development/nodemon.json",
      start: "ts-node node_modules/@bettercorp/service-base/lib/cli.js",
      lint: "eslint src/ --ext .js,.jsx,.ts,.tsx",
      test: "env TS_NODE_COMPILER_OPTIONS='{\"module\": \"commonjs\" }' node ./node_modules/nyc/bin/nyc.js --reporter json --reporter lcov ./node_modules/mocha/bin/mocha.js -r ts-node/register 'src/tests/**/*.ts' --reporter json --reporter-options output=junit.json",
      testDev:
        "env TS_NODE_COMPILER_OPTIONS='{\"module\": \"commonjs\" }' node ./node_modules/nyc/bin/nyc.js ./node_modules/mocha/bin/mocha.js -r ts-node/register 'src/tests/**/*.ts'",
    };

    console.warn("Updating scripts");
    packageJSON.scripts = packageJSON.scripts ?? {};
    for (let dScript of Object.keys(defaultScripts)) {
      console.log(
        ` - Checking script [${dScript}]: ${defaultScripts[dScript]}`
      );
      if (packageJSON.scripts[dScript] !== defaultScripts[dScript]) {
        console.log(` ^ Adding script [${dScript}]: defaultScripts[dScript]`);
        packageJSON.scripts[dScript] = defaultScripts[dScript];
      }
    }

    return packageJSON;
  },
  setupGitIgnore: () => {
    const defaultGitIgnore = [
      "/lib",
      "/node_modules",
      "/sec.config.json",
      "/junit.xml",
      "/test-file-*",
      "/dist-clients",
    ];
    let currentGitIgnoreFile = [];
    if (fs.existsSync(path.join(cwd, ".gitignore"))) {
      currentGitIgnoreFile = fs
        .readFileSync(path.join(cwd, ".gitignore"))
        .toString()
        .split(os.EOL);
    }
    for (let dGitIgnore of defaultGitIgnore) {
      let exists = false;
      for (let cGitIgnore of currentGitIgnoreFile) {
        if (cGitIgnore.indexOf(dGitIgnore) >= 0) {
          exists = true;
          break;
        }
      }
      if (!exists) {
        currentGitIgnoreFile.push(dGitIgnore);
      }
    }
    fs.writeFileSync(
      path.join(cwd, ".gitignore"),
      currentGitIgnoreFile.join(os.EOL)
    );
  },
};

yargs(defArgv)
  .scriptName("npx @bettercorp/bsb@latest")
  .usage("npx @bettercorp/bsb@latest <cmd> [args]")
  .command(
    "init [name]",
    "Init a new BSB project in this dir",
    (yargs) => {
      yargs.positional("name", {
        type: "string",
        //default: "new-bsb",
        describe:
          "The new project name. This will be used as the npm package name",
      });
      //.demandCommand(0);
      //yargs.boolean("force").alias("f", "force");
    },
    async function (argv) {
      if (fs.existsSync(packageJsonFile)) {
        console.error(`package.json file found in the current directory.`);
        process.exit(1);
      }
      if (fs.readdirSync(cwd).length > 0) {
        console.error(`Current directory is not empty.`);
        if (argv.force) process.exit(1);
      }

      console.warn(`NPM init ${argv.name}`);
      const execResult = child_process.execSync(`npm init -y`, {
        encoding: "utf8",
        cwd: cwd,
      });

      //console.log(execResult);

      let pkgJson = JSON.parse(fs.readFileSync(packageJsonFile).toString());

      pkgJson.version = "0.0.1";
      pkgJson.scripts = {};
      pkgJson = defaultFunctions.setupFiles(pkgJson);
      pkgJson = defaultFunctions.setupScripts(pkgJson);

      const gitConfigGetResult = child_process
        .execSync(`git config --get user.name && git config --get user.email`, {
          encoding: "utf8",
          cwd: cwd,
        })
        .split(os.EOL)
        .filter((v) => v !== "")
        .map((x) => x.trim());

      pkgJson.author = `${gitConfigGetResult[0]} <${gitConfigGetResult[1]}>`;
      pkgJson.main = "lib/index.js";

      let licenseOpts = await inquirer.prompt([
        {
          name: "Choose a license",
          type: "list",
          default: "AGPL-3.0-only",
          choices: [
            { name: "AGPL-3.0-only", value: "AGPL-3.0-only" },
            { name: "MIT", value: "MIT" },
            { name: "Apache 2.0", value: "Apache-2.0" },
            { name: "GPL 3.0", value: "GPL-3.0" },
            { name: "BSD 3-Clause", value: "BSD-3-Clause" },
            { name: "BSD 2-Clause", value: "BSD-2-Clause" },
            { name: "ISC", value: "ISC" },
            { name: "Unlicensed", value: "Unlicensed" },
            { name: "Other", value: "" },
          ],
        },
      ]);

      pkgJson.license = licenseOpts["Choose a license"];
      pkgJson.bsb_project = true;

      fs.writeFileSync(packageJsonFile, JSON.stringify(pkgJson, null, 2));

      child_process.execSync(`npm install`, {
        encoding: "utf8",
        cwd: cwd,
      });

      console.warn(`GIT init`);
      defaultFunctions.setupGitIgnore();
      child_process.execSync(
        `git init && git add package.json package-lock.json .gitignore && git commit -a -m "[BSB] Setup npm package."`,
        {
          encoding: "utf8",
          cwd: cwd,
        }
      );

      console.warn(`BSB setup`);
      await defaultFunctions.syncDependencies();

      child_process.execSync(
        `git add package.json package-lock.json && git commit -a -m "[BSB] Added default dependencies."`,
        {
          encoding: "utf8",
          cwd: cwd,
        }
      );

      console.log("We're going to setup the default project files now");

      await defaultFunctions.syncCoreFiles();

      fs.writeFileSync(path.join(cwd, "./src/index.ts"), "");

      console.log("Setting up default config");

      const bsbDir = path.join(cwd, "./node_modules/@bettercorp/service-base");
      console.log(
        child_process.execSync(
          `node ${path.join(bsbDir, "./lib/postinstall.js")}`,
          {
            encoding: "utf8",
            cwd: cwd,
          }
        )
      );

      child_process.execSync(
        `git add . && git commit -a -m "[BSB] Added default system files."`,
        {
          encoding: "utf8",
          cwd: cwd,
        }
      );

      console.log();
      console.log();

      console.warn("Done!");
      console.warn("___________________________________________");
      console.warn("");
      console.warn("How to use?");
      console.warn("");
      console.warn("The following commands are available: (npm run ___)");
      console.warn(" - build (This builds the plugin)");
      console.warn(" - dev (This runs the app locally)");
      console.warn(" - start (This runs the app in production mode)");
      console.warn(
        " - testDev (This runs the tests - outputs the results to the console)"
      );
      console.warn(" - test (This runs the tests - CI/CD mode)");
      console.warn(" - lint (This runs the linter)");
      console.warn("");
      console.warn("___________________________________________");
    }
  )
  .command(
    "update",
    "Update BSB project in this dir",
    (yargs) => {},
    async function (argv) {
      if (!fs.existsSync(packageJsonFile)) {
        console.error(`package.json file not found in the current directory.`);
        process.exit(1);
      }

      let pkgJson = JSON.parse(fs.readFileSync(packageJsonFile).toString());

      pkgJson = defaultFunctions.setupFiles(pkgJson);
      pkgJson = defaultFunctions.setupScripts(pkgJson);

      fs.writeFileSync(packageJsonFile, JSON.stringify(pkgJson, null, 2));

      defaultFunctions.setupGitIgnore();
      defaultFunctions.syncCoreFiles();

      console.log("NPM Update");
      await defaultFunctions.syncDependencies();

      console.log();
      console.log();

      console.warn("Done!");
    }
  )
  .command(
    "install [package]",
    "Install a BSB project in this dir",
    (yargs) => {
      yargs
        .positional("package", {
          type: "string",
          //default: "new-bsb",
          describe: "The package name to install",
        })
        .demandCommand(
          0,
          'Please provide a package name, e.g. "npm install @bettercorp/service-base-plugin-fastify"'
        );
    },
    async function (argv) {
      if (!fs.existsSync(packageJsonFile)) {
        console.error(`package.json file not found in the current directory.`);
        process.exit(1);
      }

      let pkgJson = JSON.parse(fs.readFileSync(packageJsonFile).toString());

      if (pkgJson.bsb_project !== true) {
        console.error(`Not a BSB Project...`);
        process.exit(1);
      }

      console.log(`NPM Install ${argv.package}`);
      const installResp = child_process.execSync(
        `npm install --save ${argv.package}`,
        {
          encoding: "utf8",
          cwd: cwd,
        }
      );
      if (installResp.indexOf("npm ERR!") > 0) {
        console.error(installResp);
        process.exit(2);
      }

      const bsbDir = path.join(cwd, "./node_modules/@bettercorp/service-base");
      console.log(
        child_process.execSync(
          `node ${path.join(bsbDir, "./lib/postinstall.js")}`,
          {
            encoding: "utf8",
            cwd: cwd,
          }
        )
      );

      console.log();
      console.log();

      console.warn("Done!");
      console.log();
      console.log("please run npx @bettercorp/bsb manage to enable the plugin");
    }
  )
  .command(
    "manage [plugin]",
    "Update a BSB plugin",
    (yargs) => {
      yargs.positional("plugin", {
        type: "string",
        //default: "new-bsb",
        describe: "The plugin name to manage",
      });
      yargs.option("state", {
        alias: "s",
        type: "string",
        describe: "Enable/disable the plugin",
        choices: ["e", "d", "enable", "disable"],
      });
      yargs.option("profile", {
        alias: "d",
        type: "string",
        describe: "Choose the deployment profile",
      });
      yargs.option("mapped", {
        alias: "m",
        type: "string",
        describe: "Plugin mapped name",
      });
    },
    async function (argv) {
      //console.log(argv);
      if (!fs.existsSync(packageJsonFile)) {
        console.error(`package.json file not found in the current directory.`);
        process.exit(1);
      }

      let pkgJson = JSON.parse(fs.readFileSync(packageJsonFile).toString());

      if (pkgJson.bsb_project !== true) {
        console.error(`Not a BSB Project...`);
        process.exit(1);
      }

      if (!fs.existsSync(secJsonFile)) {
        console.error(
          `sec.config.json file not found in the current directory.`
        );
        process.exit(1);
      }

      const bsbDir = path.join(cwd, "./node_modules/@bettercorp/service-base");
      child_process.execSync(
        `node ${path.join(bsbDir, "./lib/postinstall.js")}`,
        {
          encoding: "utf8",
          cwd: cwd,
        }
      );

      let secConfigJson = JSON.parse(fs.readFileSync(secJsonFile).toString());
      secConfigJson.plugins = secConfigJson.plugins || {};
      secConfigJson.deploymentProfiles = secConfigJson.deploymentProfiles || {};

      let deploymentProfile = argv.profile ?? null;
      if (secConfigJson.deploymentProfiles[deploymentProfile] === undefined) {
        deploymentProfile = null;
      }

      if (argv.profile !== undefined && deploymentProfile === null) {
        console.error(
          `Deployment profile ${argv.profile} not found in the sec.config.json file.`
        );
        process.exit(1);
      }
      const deploymentProfilesList = Object.keys(
        secConfigJson.deploymentProfiles
      );
      if (deploymentProfile === null) {
        if (deploymentProfilesList.length === 1) deploymentProfile = "default";
        else
          deploymentProfile = (
            await inquirer.prompt([
              {
                name: "answer",
                message: "Choose a deployment profile",
                type: "list",
                default: "default",
                choices: deploymentProfilesList.map((x) => {
                  return {
                    name: x,
                    value: x,
                  };
                }),
              },
            ])
          ).answer;
      }

      console.clear();
      console.log(`Deployment profile: ${deploymentProfile}`);

      let pluginName = argv.plugin ?? null;
      if (
        secConfigJson.deploymentProfiles[deploymentProfile][pluginName] ===
        undefined
      ) {
        pluginName = null;
      }
      if (
        secConfigJson.deploymentProfiles["default"][pluginName] === undefined
      ) {
        pluginName = null;
      }

      if (argv.plugin !== undefined && pluginName === null) {
        console.error(
          `Plugin ${argv.profile} not found in the sec.config.json file.`
        );
        process.exit(1);
      }
      const pluginList = [];
      for (let pluginArr of deploymentProfilesList.map((x) => {
        return Object.keys(secConfigJson.deploymentProfiles[x]);
      })) {
        for (let ipluginName of pluginArr)
          if (!pluginList.includes(ipluginName)) pluginList.push(ipluginName);
      }

      if (pluginName === null) {
        pluginName = (
          await inquirer.prompt([
            {
              name: "answer",
              message: "Choose a plugin to manage",
              type: "list",
              default: "default",
              choices: pluginList.map((x) => {
                return {
                  name: `${x} (${
                    secConfigJson.deploymentProfiles[deploymentProfile][x] !==
                    undefined // mappedName
                      ? secConfigJson.deploymentProfiles[deploymentProfile][x]
                          .enabled
                        ? secConfigJson.deploymentProfiles[deploymentProfile][x]
                            .mappedName === x
                          ? "enabled"
                          : "enabled as " +
                            secConfigJson.deploymentProfiles[deploymentProfile][
                              x
                            ].mappedName
                        : "disabled"
                      : "disabled"
                  })`,
                  value: x,
                };
              }),
            },
          ])
        ).answer;
      }

      console.clear();
      console.log(`Deployment profile: ${deploymentProfile}`);
      console.log(`Plugin: ${pluginName}`);

      let state = true;
      let currentState =
        secConfigJson.deploymentProfiles[deploymentProfile][pluginName] !==
        undefined // mappedName
          ? secConfigJson.deploymentProfiles[deploymentProfile][pluginName]
              .enabled
          : false;

      if (argv.state !== undefined) {
        state = argv.state === "e" || argv.state === "enable";
      }
      if (argv.state === undefined) {
        state =
          (
            await inquirer.prompt([
              {
                name: "answer",
                message: "Change the plugin state",
                type: "list",
                default: "enabled",
                choices: [
                  {
                    name: "Enabled" + (currentState ? " (current)" : ""),
                    value: "enabled",
                  },
                  {
                    name: "Disabled" + (!currentState ? " (current)" : ""),
                    value: "disabled",
                  },
                ],
              },
            ])
          ).answer === "enabled";
      }

      console.clear();
      console.log(`Deployment profile: ${deploymentProfile}`);
      console.log(`Plugin: ${pluginName}`);
      console.log(`State: ${state ? "enabled" : "disabled"}`);

      let mappedName = null;
      let currentMappedName =
        secConfigJson.deploymentProfiles[deploymentProfile][pluginName] !==
        undefined // mappedName
          ? secConfigJson.deploymentProfiles[deploymentProfile][pluginName]
              .mappedName
          : pluginName;

      if (argv.mapped !== undefined) {
        mappedName = argv.mapped;
      }
      if (argv.mapped === undefined) {
        mappedName = (
          await inquirer.prompt([
            {
              name: "answer",
              message: "Change the plugin referenced name (mapped name)",
              type: "mappedName",
              default: currentMappedName,
            },
          ])
        ).answer;
      }
      if (
        pluginName.indexOf("service-") == 0 &&
        mappedName.indexOf("service-") < 0
      ) {
        console.error('Mapped name must start with "service-"');
        process.exit(1);
      }
      if (pluginName.indexOf("log-") == 0 && mappedName.indexOf("log-") < 0) {
        console.error('Mapped name must start with "log-"');
        process.exit(1);
      }
      if (
        pluginName.indexOf("events-") == 0 &&
        mappedName.indexOf("events-") < 0
      ) {
        console.error('Mapped name must start with "events-"');
        process.exit(1);
      }

      console.clear();
      console.log(`Deployment profile: ${deploymentProfile}`);
      console.log(`Plugin: ${pluginName}`);
      console.log(`State: ${state ? "enabled" : "disabled"}`);
      console.log(
        `Mapped name: ${
          pluginName === mappedName ? "<default> " : ""
        }${mappedName}`
      );

      secConfigJson.deploymentProfiles[deploymentProfile] =
        secConfigJson.deploymentProfiles[deploymentProfile] || {};
      secConfigJson.deploymentProfiles[deploymentProfile][pluginName] =
        secConfigJson.deploymentProfiles[deploymentProfile][pluginName] || {};
      secConfigJson.deploymentProfiles[deploymentProfile][pluginName].enabled =
        state;
      secConfigJson.deploymentProfiles[deploymentProfile][
        pluginName
      ].mappedName = mappedName;

      fs.writeFileSync(secJsonFile, JSON.stringify(secConfigJson, null, 2));

      child_process.execSync(
        `node ${path.join(bsbDir, "./lib/postinstall.js")}`,
        {
          encoding: "utf8",
          cwd: cwd,
        }
      );

      console.log();
      console.log();

      console.warn("Done!");
    }
  )
  .command(
    "info",
    "Print info about the config",
    (yargs) => {},
    async function (argv) {
      //console.log(argv);
      if (!fs.existsSync(packageJsonFile)) {
        console.error(`package.json file not found in the current directory.`);
        process.exit(1);
      }

      let pkgJson = JSON.parse(fs.readFileSync(packageJsonFile).toString());

      if (pkgJson.bsb_project !== true) {
        console.error(`Not a BSB Project...`);
        process.exit(1);
      }

      if (!fs.existsSync(secJsonFile)) {
        console.error(
          `sec.config.json file not found in the current directory.`
        );
        process.exit(1);
      }

      let secConfigJson = JSON.parse(fs.readFileSync(secJsonFile).toString());
      secConfigJson.plugins = secConfigJson.plugins || {};
      secConfigJson.deploymentProfiles = secConfigJson.deploymentProfiles || {};

      const deploymentProfilesList = Object.keys(
        secConfigJson.deploymentProfiles
      );

      const pluginList = [];
      for (let pluginArr of deploymentProfilesList.map((x) => {
        return Object.keys(secConfigJson.deploymentProfiles[x]);
      })) {
        for (let ipluginName of pluginArr)
          if (!pluginList.includes(ipluginName)) pluginList.push(ipluginName);
      }

      for (let deploymentProfile of deploymentProfilesList) {
        console.log(`Deployment profile: ${deploymentProfile}`);
        for (let pluginName of pluginList) {
          console.log(
            `  ${pluginName}: ${
              secConfigJson.deploymentProfiles[deploymentProfile][
                pluginName
              ] !== undefined
                ? secConfigJson.deploymentProfiles[deploymentProfile][
                    pluginName
                  ].enabled
                  ? "enabled" +
                    (secConfigJson.deploymentProfiles[deploymentProfile][
                      pluginName
                    ].mappedName !== pluginName
                      ? ` as ${secConfigJson.deploymentProfiles[deploymentProfile][pluginName].mappedName}`
                      : "")
                  : "disabled"
                : "disabled"
            }`
          );
        }
      }
    }
  )
  .help("h")
  .alias("h", "help")
  .epilog("copyright BetterCorp 2016-" + new Date().getFullYear()).argv;
