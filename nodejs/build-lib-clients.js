const fs = require("fs");
const path = require("path");
const process = require("process");

let cwd = process.cwd();

console.log("BSB lib clients: " + cwd);
const pkgJSONPath = path.join(cwd, "./package.json");
const libDir = path.join(cwd, "./lib");
if (!fs.existsSync(libDir)) {
  console.log("Build your package first - no lib dir");
  process.exit(1);
}
const clientsDir = path.join(libDir, "./clients");
if (!fs.existsSync(clientsDir)) {
  console.log("No clients to build - no clients dir in lib");
  process.exit(0);
}

let clients = fs.readdirSync(clientsDir).filter((x) => x.indexOf("-") !== 0);
if (clients.length === 0) {
  console.log("No clients to build - no client libs");
  process.exit(0);
}

let distDir = path.join(cwd, "./dist-clients");
if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true });
fs.mkdirSync(distDir);

let sharedDir = path.join(libDir, "./shared");
if (!fs.existsSync(sharedDir)) {
  sharedDir = false;
}
const indexExts = [".js", ".d.ts"];
for (let client of clients) {
  let indexFile = path.join(libDir, "./index." + client);
  let indexIsMain = true;
  if (!fs.existsSync(indexFile + indexExts[0])) {
    indexIsMain = false;
    indexFile = path.join(libDir, "./index");
  }
  if (!fs.existsSync(indexFile + indexExts[0])) indexFile = false;

  console.log(`Building client: ${client}...`);
  let clientDir = path.join(clientsDir, client);
  let clientDistDir = path.join(distDir, client);
  fs.mkdirSync(clientDistDir);
  let clientsDistLibDir = path.join(clientDistDir, "lib");
  fs.mkdirSync(clientsDistLibDir);
  if (indexFile !== false) {
    for (let indexExt of indexExts) {
      let indexFileExt = indexFile + indexExt;
      if (fs.existsSync(indexFileExt)) {
        console.log(
          `Copying index file: ${indexFileExt} -> ${path.join(
            clientsDistLibDir,
            "index" + indexExt
          )}`
        );
        fs.copyFileSync(
          indexFileExt,
          path.join(clientsDistLibDir, "index" + indexExt)
        );
      }
    }
  }
  if (sharedDir !== false) {
    let clientsDistLibSharedDir = path.join(clientsDistLibDir, "shared");
    console.log(
      `Copying shared dir: ${sharedDir} -> ${clientsDistLibSharedDir}`
    );
    fs.mkdirSync(clientsDistLibSharedDir);
    fs.cpSync(sharedDir, clientsDistLibSharedDir, { recursive: true });
  }
  let clientsDistLibClientsDir = path.join(clientsDistLibDir, "clients");
  fs.mkdirSync(clientsDistLibClientsDir);
  let clientsDistLibClientsClientDir = path.join(
    clientsDistLibClientsDir,
    client
  );
  fs.mkdirSync(clientsDistLibClientsClientDir);
  fs.cpSync(clientDir, clientsDistLibClientsClientDir, { recursive: true });
  let dstPkgJSONFile = path.join(clientDistDir, "package.json");
  fs.cpSync(pkgJSONPath, dstPkgJSONFile);
  let pkgg = JSON.parse(fs.readFileSync(dstPkgJSONFile, "utf-8").toString());
  pkgg.scripts = {};
  pkgg.main =
    indexIsMain && indexFile !== false
      ? "lib/index.js"
      : `lib/clients/${client}/plugin.js`;
  console.log(`Setting main entrypoint to: ${pkgg.main}`);
  pkgg.files = ["lib/**/*"];
  if (indexFile !== false) {
    pkgg.files.push("index.js");
  }
  if (sharedDir !== false) {
    pkgg.files.push("shared/**/*");
  }
  pkgg.bin = {};
  pkgg.bsb_project = undefined;
  pkgg.name = `@bsb-client/${client}`;
  fs.writeFileSync(dstPkgJSONFile, JSON.stringify(pkgg, null, 2));
}

console.log("BSB Post Install: Complete");
