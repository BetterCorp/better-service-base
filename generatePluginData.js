const fs = require("fs");
const https = require("https");
const path = require("path");
const execSync = require("child_process").execSync;
const generateConfigDefinition =
  require("./generateConfigDefinition.js").convert;

const tempDir = path.join(process.cwd(), "_temp");

const getGithubRepos = () =>
  new Promise(async (resolve, reject) => {
    let options = {
      method: "GET",
      hostname: "api.github.com",
      path:
        "/search/repositories?q=topic:bsb-plugin&noonce=" +
        new Date().getTime().toString(),
      headers: {
        Accept: "application/vnd.github.text-match+json",
        "User-Agent": "BetterServiceBase Documentation",
      },
      maxRedirects: 2,
    };

    let req = https.request(options, function (res) {
      let chunks = [];

      res.on("data", function (chunk) {
        chunks.push(chunk);
      });

      res.on("end", function (chunk) {
        let body = Buffer.concat(chunks);
        //console.log(body.toString());
        resolve(JSON.parse(body.toString()));
      });

      res.on("error", function (error) {
        console.error(error);
        reject(error);
      });
    });

    req.end();
  });

const downloadGithubRepo = (ownerRepo, branch, cwd) =>
  new Promise(async (resolve, reject) => {
    let options = {
      method: "GET",
      hostname: "codeload.github.com",
      path: `/${ownerRepo}/tar.gz/refs/heads/${branch}`,
      headers: {
        "User-Agent": "BetterServiceBase Documentation",
      },
      maxRedirects: 2,
    };
    // hostname: "github.com",
    // path: `/${ownerRepo}/archive/refs/heads/${branch}.tar.gz`,
    // https://codeload.github.com/BetterCorp/service-base-events-rabbitmq/tar.gz/refs/heads/master

    const filePath = path.join(cwd, "./Repo.tar.gz");
    const writeStream = fs.createWriteStream(filePath, { encoding: "utf8" });
    let fileInfo = null;
    const request = https.get(options, function (response) {
      if (response.statusCode !== 200) {
        fs.unlink(filePath, () => {
          reject({
            error: response.statusCode,
            headers: response.headers,
            body: response.body,
          });
        });
        return;
      }

      fileInfo = {
        mime: response.headers["content-type"],
        size: parseInt(response.headers["content-length"], 10),
      };

      response.pipe(writeStream);

      // The destination stream is ended by the time it's called
      writeStream.on("finish", () => resolve(fileInfo));

      request.on("error", (err) => {
        fs.unlink(filePath, () =>
          reject({ error: err, headers: response.headers, body: response.body })
        );
      });

      writeStream.on("error", (err) => {
        fs.unlink(filePath, () =>
          reject({ error: err, headers: response.headers, body: response.body })
        );
      });

      request.end();
    });
  });

const defaultPlugins = ["@bettercorp/service-base", "bcrypt"];
const setupDefaultPackages = (temp_node_modules, plugins) => {
  if (!fs.existsSync(path.join(temp_node_modules, "./node_modules"))) {
    console.log("Setup temp node_modules");
    execSync(`cd ${temp_node_modules} && npm init -y`, {
      encoding: "utf-8",
    });
  }
  console.log("Setup temp node_modules packages: " + plugins.join(","));
  execSync(
    `cd ${temp_node_modules} && npm init -y && npm i --save ${plugins.join(
      " "
    )}`,
    {
      encoding: "utf-8",
    }
  );
};
(async () => {
  const reposConfig = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "repos.config.json"))
  );
  const existingConfig = JSON.parse(
    fs.readFileSync("./plugins.json").toString()
  );
  let availPlugins = [];
  if (fs.existsSync(tempDir))
    execSync(`rm -rfv ${tempDir}`, { encoding: "utf-8" });
  fs.mkdirSync(tempDir);
  const temp_node_modules = fs.mkdtempSync(tempDir + "/");
  const temp_node_modules_dir = path.join(temp_node_modules, "./node_modules");
  setupDefaultPackages(temp_node_modules, defaultPlugins);
  execSync(
    `cd ${temp_node_modules} && npm init -y && npm i --save ${defaultPlugins.join(
      " "
    )}`,
    {
      encoding: "utf-8",
    }
  );
  const knownPlugins = await getGithubRepos();
  // fs.writeFileSync("githubdata.json", JSON.stringify(knownPlugins, " ", 2));
  console.log(`Found ${knownPlugins.total_count} repositories`);
  for (let repo of knownPlugins.items) {
    try {
      console.log(`${repo.full_name}: `);
      if (repo.is_template !== false) {
        console.warn(`${repo.full_name}: TEMPLATE / IGNORED`);
        continue;
      }
      if (repo.archived !== false) {
        console.warn(`  : ARCHIVED / IGNORED`);
        continue;
      }
      if (repo.disabled !== false) {
        console.warn(`  : DISABLED / IGNORED`);
        continue;
      }
      if (
        repo.language !== "TypeScript" &&
        repo.topics.indexOf("bsb-plugin-node") < 0
      ) {
        console.warn(`  : NOT TS / IGNORED`);
        continue;
      }
      console.log(`  : Checking repo knowledge`);
      const repoTempDir = fs.mkdtempSync(tempDir + "/");
      const npmTempDir = fs.mkdtempSync(tempDir + "/");
      console.log(`  : Downloading repo`);
      await downloadGithubRepo(
        repo.full_name,
        repo.default_branch,
        repoTempDir
      );
      console.log(`  : Extracting repo`);
      execSync(`cd ${repoTempDir} && tar -xvf Repo.tar.gz`, {
        encoding: "utf-8",
      });
      console.log(`  : Getting Package Config`);
      const repoDirTemp = path.join(
        repoTempDir,
        `${repo.name}-${repo.default_branch}`
      );

      let packgeJson = JSON.parse(
        fs.readFileSync(path.join(repoDirTemp, "package.json"))
      );
      console.log(`  : Getting NPM package`);
      execSync(
        `cd ${npmTempDir} && npm pack ${packgeJson.name}@latest && mv *.tgz Package.tar.gz`,
        {
          encoding: "utf-8",
        }
      );
      console.log(`  : Extracting NPM package`);
      execSync(`cd ${npmTempDir} && tar -xvf Package.tar.gz`, {
        encoding: "utf-8",
      });
      execSync(
        `cp -Rv ${temp_node_modules_dir} ${path.join(
          repoDirTemp,
          "./node_modules"
        )}`,
        {
          encoding: "utf-8",
        }
      );
      const updateNodeModules = (temp_node_modules_dr, npmTempDr) => {
        const destNodeModDir = path.join(
          npmTempDr,
          `package`,
          "./node_modules"
        );
        if (fs.existsSync(destNodeModDir)) {
          fs.rmSync(destNodeModDir, { recursive: true, force: true });
        }
        execSync(`cp -Rv ${temp_node_modules_dr} ${destNodeModDir}`, {
          encoding: "utf-8",
        });
      };
      updateNodeModules(temp_node_modules_dir, npmTempDir);
      packgeJson = JSON.parse(
        fs.readFileSync(path.join(npmTempDir, `./package/`, "package.json"))
      );
      console.log(`  : Getting list of plugins`);
      let plugins = fs
        .readdirSync(path.join(npmTempDir, `package`, "lib/plugins/"))
        .filter((x) => x.indexOf("-") !== 0)
        .filter((x) =>
          fs.existsSync(
            path.join(
              repoTempDir,
              `${repo.name}-${repo.default_branch}`,
              "src/plugins/",
              x,
              "plugin.config.json"
            )
          )
        )
        .map((x) => {
          try {
            let pluginType = "plugin";
            if (x.indexOf("events-") === 0) pluginType = "events";
            if (x.indexOf("log-") === 0) pluginType = "logging";
            if (x.indexOf("config-") === 0) pluginType = "config";
            let definition = JSON.parse(
              fs.readFileSync(
                path.join(
                  repoTempDir,
                  `${repo.name}-${repo.default_branch}`,
                  "src/plugins/",
                  x,
                  "plugin.config.json"
                )
              )
            );

            if (
              definition.requiredPackagesForConfig !== undefined &&
              definition.requiredPackagesForConfig !== null &&
              definition.requiredPackagesForConfig.length !== null
            ) {
              setupDefaultPackages(
                temp_node_modules,
                definition.requiredPackagesForConfig
              );
              updateNodeModules(temp_node_modules_dir, npmTempDir);
            }

            return {
              type: pluginType,
              name: x,
              def: definition,
              config:
                pluginType === "config"
                  ? null
                  : generateConfigDefinition(
                      path.join(
                        repoTempDir,
                        `${repo.name}-${repo.default_branch}`,
                        "src/plugins/",
                        x,
                        "sec.config.ts"
                      ),
                      path.join(
                        npmTempDir,
                        "package/lib/plugins/",
                        x,
                        "sec.config.js"
                      )
                    ),
              pluginLink:
                ((reposConfig[repo.owner.login] || {})[repo.name] || {})[x] ||
                null,
            };
          } catch (exc) {
            console.error(exc);
            return null;
          }
        })
        .filter((x) => x !== null);
      for (let plugin of plugins)
        console.log(`    > [${plugin.name}] as [${plugin.type}]`);
      fs.writeFileSync(
        path.join(npmTempDir, "./plugins.json"),
        JSON.stringify(plugins, " ", 2)
      );
      if (plugins.length > 0) {
        availPlugins.push({
          name: packgeJson.name,
          version: packgeJson.version,
          lang: 'node',
          author: {
            name: repo.owner.login,
            url: repo.owner.html_url,
            avatar: repo.owner.avatar_url,
          },
          github: repo.html_url,
          plugins: plugins,
        });
        console.log(`  : Completed`);
      } else {
        console.log(`  : No Plugins`);
      }
    } catch (exc) {
      console.error(exc);
      console.warn(`  : IGNORED`);
    }
  }

  availPlugins = availPlugins.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync("./plugins.json", JSON.stringify(availPlugins, " ", 2));
  fs.writeFileSync("./plugin-stats.json", JSON.stringify({
    total: availPlugins.length,
    nodejs: {
      total: availPlugins.filter(x => x.lang === 'node').length,
      logging: availPlugins.filter(x => x.lang === 'node').filter(x => x.plugins.filter(y => y.type === 'logging').length > 0).length,
      events: availPlugins.filter(x => x.lang === 'node').filter(x => x.plugins.filter(y => y.type === 'events').length > 0).length,
      config: availPlugins.filter(x => x.lang === 'node').filter(x => x.plugins.filter(y => y.type === 'config').length > 0).length,
      services: availPlugins.filter(x => x.lang === 'node').filter(x => x.plugins.filter(y => y.type === 'plugin').length > 0).length,
    },
    dotnet: {
      total: availPlugins.filter(x => x.lang === 'dotnet').length,
      logging: availPlugins.filter(x => x.lang === 'dotnet').filter(x => x.plugins.filter(y => y.type === 'logging').length > 0).length,
      events: availPlugins.filter(x => x.lang === 'dotnet').filter(x => x.plugins.filter(y => y.type === 'events').length > 0).length,
      config: availPlugins.filter(x => x.lang === 'dotnet').filter(x => x.plugins.filter(y => y.type === 'config').length > 0).length,
      services: availPlugins.filter(x => x.lang === 'dotnet').filter(x => x.plugins.filter(y => y.type === 'plugin').length > 0).length,
    },
    go: {
      total: availPlugins.filter(x => x.lang === 'go').length,
      logging: availPlugins.filter(x => x.lang === 'go').filter(x => x.plugins.filter(y => y.type === 'logging').length > 0).length,
      events: availPlugins.filter(x => x.lang === 'go').filter(x => x.plugins.filter(y => y.type === 'events').length > 0).length,
      config: availPlugins.filter(x => x.lang === 'go').filter(x => x.plugins.filter(y => y.type === 'config').length > 0).length,
      services: availPlugins.filter(x => x.lang === 'go').filter(x => x.plugins.filter(y => y.type === 'plugin').length > 0).length,
    },
    rust: {
      total: availPlugins.filter(x => x.lang === 'rust').length,
      logging: availPlugins.filter(x => x.lang === 'rust').filter(x => x.plugins.filter(y => y.type === 'logging').length > 0).length,
      events: availPlugins.filter(x => x.lang === 'rust').filter(x => x.plugins.filter(y => y.type === 'events').length > 0).length,
      config: availPlugins.filter(x => x.lang === 'rust').filter(x => x.plugins.filter(y => y.type === 'config').length > 0).length,
      services: availPlugins.filter(x => x.lang === 'rust').filter(x => x.plugins.filter(y => y.type === 'plugin').length > 0).length,
    },
    python: {
      total: availPlugins.filter(x => x.lang === 'python').length,
      logging: availPlugins.filter(x => x.lang === 'python').filter(x => x.plugins.filter(y => y.type === 'logging').length > 0).length,
      events: availPlugins.filter(x => x.lang === 'python').filter(x => x.plugins.filter(y => y.type === 'events').length > 0).length,
      config: availPlugins.filter(x => x.lang === 'python').filter(x => x.plugins.filter(y => y.type === 'config').length > 0).length,
      services: availPlugins.filter(x => x.lang === 'python').filter(x => x.plugins.filter(y => y.type === 'plugin').length > 0).length,
    }
  }, " ", 2));
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    //execSync(`rm -rfv ${tempDir}`, { encoding: "utf-8" });
  }
  let changes = existingConfig.length !== availPlugins.length;

  if (changes) {
    console.log("Changes detected");
  } else {
    console.log("Changes ?");
    for (let repoIndex = 0; repoIndex < existingConfig.length; repoIndex++) {
      if (existingConfig[repoIndex].name !== availPlugins[repoIndex].name) {
        console.log(
          `[repos-name] ${existingConfig[repoIndex].name} !== ${availPlugins[repoIndex].name}`
        );
        changes = true;
        break;
      }
      if (
        existingConfig[repoIndex].version !== availPlugins[repoIndex].version
      ) {
        console.log(
          `[repos-version] ${existingConfig[repoIndex].version} !== ${availPlugins[repoIndex].version}`
        );
        changes = true;
        break;
      }
      if (existingConfig[repoIndex].github !== availPlugins[repoIndex].github) {
        console.log(
          `[repos-github] ${existingConfig[repoIndex].github} !== ${availPlugins[repoIndex].github}`
        );
        changes = true;
        break;
      }
      if (
        existingConfig[repoIndex].author.name !==
        availPlugins[repoIndex].author.name
      ) {
        console.log(
          `[repos-author-name] ${existingConfig[repoIndex].author.name} !== ${availPlugins[repoIndex].author.name}`
        );
        changes = true;
        break;
      }
      if (
        existingConfig[repoIndex].author.avatar !==
        availPlugins[repoIndex].author.avatar
      ) {
        console.log(
          `[repos-author-avatar] ${existingConfig[repoIndex].author.avatar} !== ${availPlugins[repoIndex].author.avatar}`
        );
        changes = true;
        break;
      }

      if (
        existingConfig[repoIndex].plugins.length !==
        availPlugins[repoIndex].plugins.length
      ) {
        console.log(
          `[repos-plugins] ${existingConfig[repoIndex].plugins.length} !== ${availPlugins[repoIndex].plugins.length}`
        );
        changes = true;
        break;
      }

      console.log(
        `${existingConfig[repoIndex].name} [plugins] ${availPlugins[repoIndex].name}`
      );
      for (
        let pluginIndex = 0;
        pluginIndex < existingConfig[repoIndex].plugins.length;
        pluginIndex++
      ) {
        if (
          existingConfig[repoIndex].plugins[pluginIndex].type !==
          availPlugins[repoIndex].plugins[pluginIndex].type
        ) {
          console.log(
            `${existingConfig[repoIndex].name} [plugins-type] ${existingConfig[repoIndex].plugins[pluginIndex].type} !== ${availPlugins[repoIndex].plugins[pluginIndex].type}`
          );
          changes = true;
          break;
        }
        if (
          existingConfig[repoIndex].plugins[pluginIndex].name !==
          availPlugins[repoIndex].plugins[pluginIndex].name
        ) {
          console.log(
            `${existingConfig[repoIndex].name} [plugins-name] ${existingConfig[repoIndex].plugins[pluginIndex].name} !== ${availPlugins[repoIndex].plugins[pluginIndex].name}`
          );
          changes = true;
          break;
        }
        if (
          existingConfig[repoIndex].plugins[pluginIndex].icon !==
          availPlugins[repoIndex].plugins[pluginIndex].icon
        ) {
          console.log(
            `${existingConfig[repoIndex].name} [plugins-icon] ${existingConfig[repoIndex].plugins[pluginIndex].icon} !== ${availPlugins[repoIndex].plugins[pluginIndex].icon}`
          );
          changes = true;
          break;
        }
        if (
          existingConfig[repoIndex].plugins[pluginIndex].description !==
          availPlugins[repoIndex].plugins[pluginIndex].description
        ) {
          console.log(
            `${existingConfig[repoIndex].name} [plugins-description] ${existingConfig[repoIndex].plugins[pluginIndex].description} !== ${availPlugins[repoIndex].plugins[pluginIndex].description}`
          );
          changes = true;
          break;
        }
        if (
          existingConfig[repoIndex].plugins[pluginIndex].pluginLink !==
          availPlugins[repoIndex].plugins[pluginIndex].pluginLink
        ) {
          console.log(
            `${existingConfig[repoIndex].name} [plugins-pluginLink] ${existingConfig[repoIndex].plugins[pluginIndex].pluginLink} !== ${availPlugins[repoIndex].plugins[pluginIndex].pluginLink}`
          );
          changes = true;
          break;
        }
        if (
          existingConfig[repoIndex].plugins[pluginIndex].badges !==
          availPlugins[repoIndex].plugins[pluginIndex].badges
        ) {
          console.log(
            `${existingConfig[repoIndex].name} [plugins-badges] ${availPlugins[repoIndex].plugins[pluginIndex].badges} !== ${availPlugins[repoIndex].plugins[pluginIndex].badges}`
          );
          changes = true;
          break;
        }
        if (
          (existingConfig[repoIndex].plugins[pluginIndex].config || {})
            .interfaceName !==
          (availPlugins[repoIndex].plugins[pluginIndex].config || {})
            .interfaceName
        ) {
          console.log(
            `${existingConfig[repoIndex].name} [plugins-interfaceName] ${
              (existingConfig[repoIndex].plugins[pluginIndex].config || {})
                .interfaceName
            } !== ${
              (availPlugins[repoIndex].plugins[pluginIndex].config || {})
                .interfaceName
            }`
          );
          changes = true;
          break;
        }
        if (
          JSON.stringify(
            (existingConfig[repoIndex].plugins[pluginIndex].config || {})
              .definitions || {}
          ) !==
          JSON.stringify(
            (availPlugins[repoIndex].plugins[pluginIndex].config || {})
              .definitions || {}
          )
        ) {
          console.log(
            `${
              existingConfig[repoIndex].name
            } [plugins-definitions] ${JSON.stringify(
              (existingConfig[repoIndex].plugins[pluginIndex].config || {})
                .definitions
            )} != ${JSON.stringify(
              (availPlugins[repoIndex].plugins[pluginIndex].config || {})
                .definitions
            )}`
          );
          changes = true;
          break;
        }
      }

      if (changes) break;
    }
  }
  //const newHash = getFileHash("./plugins.json");
  console.log(`? changes: ${changes}`);
  console.log(`::set-output name=changes::${changes}`);
})();
