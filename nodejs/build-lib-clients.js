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
let indexDTS = path.join(libDir, "./index.d.ts");
if (!fs.existsSync(indexDTS)) indexDTS = false;

for (let client of clients) {
  console.log(`Building client: ${client}...`);
  let clientDir = path.join(clientsDir, client);
  let clientDistDir = path.join(distDir, client);
  fs.mkdirSync(clientDistDir);
  if (indexDTS)
    fs.copyFileSync(indexDTS, path.join(clientDistDir, "index.d.ts"));
  let clientsDistLibDir = path.join(clientDistDir, "lib");
  fs.mkdirSync(clientsDistLibDir);
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
  pkgg.files = ["lib/**/*"];
  pkgg.bin = {};
  pkgg.bsb_project = undefined;
  pkgg.name = `@bsb/${client}`;
  fs.writeFileSync(dstPkgJSONFile, JSON.stringify(pkgg, null, 2));
}

console.log("BSB Post Install: Complete");
