const fs = require("fs");
const crypto = require("crypto");
const https = require("https");
const path = require("path");
const execSync = require("child_process").execSync;
const generateConfigDefinition =
  require("./generateConfigDefinition.js").convert;

const tempDir = path.join(process.cwd(), "_temp");

const getFileHash = (file) => {
  const fileBuffer = fs.readFileSync(file);
  const hashSum = crypto.createHash("sha256");
  hashSum.update(fileBuffer);

  return hashSum.digest("hex");
};

const getGithubRepos = () =>
  new Promise(async (resolve, reject) => {
    let options = {
      method: "GET",
      hostname: "api.github.com",
      path: "/search/repositories?q=topic:bsb-plugin",
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

(async () => {
  const reposConfig = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "repos.config.json"))
  );
  const existingHashOfFile = getFileHash("./plugins.json");
  let availPlugins = [];
  if (fs.existsSync(tempDir))
    execSync(`rm -rfv ${tempDir}`, { encoding: "utf-8" });
  fs.mkdirSync(tempDir);
  const temp_node_modules = fs.mkdtempSync(tempDir + "/");
  const temp_node_modules_dir = path.join(temp_node_modules, "./node_modules");
  execSync(
    `cd ${temp_node_modules} && npm init -y && npm i --save @bettercorp/service-base`,
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
      if (repo.language !== "TypeScript") {
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
      execSync(
        `cp -Rv ${temp_node_modules_dir} ${path.join(
          npmTempDir,
          `package`,
          "./node_modules"
        )}`,
        {
          encoding: "utf-8",
        }
      );
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
            return {
              type: pluginType,
              name: x,
              def: JSON.parse(
                fs.readFileSync(
                  path.join(
                    repoTempDir,
                    `${repo.name}-${repo.default_branch}`,
                    "src/plugins/",
                    x,
                    "plugin.config.json"
                  )
                )
              ),
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

  fs.writeFileSync("./plugins.json", JSON.stringify(availPlugins, " ", 2));
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    //execSync(`rm -rfv ${tempDir}`, { encoding: "utf-8" });
  }
  const newHash = getFileHash("./plugins.json");
  console.log(
    `? changes: ${
      newHash !== existingHashOfFile
    } (e:${existingHashOfFile}|n:${newHash})`
  );
  console.log(`::set-output name=changes::${newHash !== existingHashOfFile}`);
})();