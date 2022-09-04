const fs = require("fs");
const path = require("path");
const process = require("process");

if (`${process.env.BSB_CONTAINER || ''}` !== '') return console.warn('Building in BSB container, not running default setup process.');

let cwd = process.cwd();
let hardSetCWD = false;

for (let argv of process.argv) {
  if (argv.indexOf("--cwd=") === 0) {
    cwd = argv.split("=")[1].trim();
    hardSetCWD = true;
  }
}

console.log("BSB Post Install: " + cwd);
if (fs.existsSync(path.join(cwd, "./.bsb.local"))) {
  console.log("BSB Post Install: Ignore");
} else {
  console.log("BSB Post Install: Run");
  if (cwd.indexOf("/node_modules/") > 0 && hardSetCWD === false) {
    console.log("BSB Post Install: Search - we`re in node_modules dir.");
    const argSpl = cwd.indexOf('/') >= 0 ? '/' : '\\';
    cwd = cwd.split(`${argSpl}node_modules${argSpl}`)[0];
    console.log("BSB Post Install: Try " + cwd);
  }
  const bsbBase = path.join(cwd, "./node_modules/@bettercorp/service-base");
  if (!fs.existsSync(bsbBase)) {
    console.log("BSB Post Install: Bypass - cannot find service-base.");
    process.exit(0);
  }
  const installer = require(path.join(bsbBase, "./lib/postinstall.js")).default;
  //console.log(fs.readdirSync("./build/"));
  installer(cwd);
  console.log("BSB Post Install: Complete");
}
