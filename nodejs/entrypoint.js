const fs = require("fs");
const execSync = require("child_process").execSync;

if (!fs.existsSync("./package.json")) {
  fs.writeFileSync(
    "./package.json",
    '{"name": "@bettercorp/service-base-docker-container", "version": "1.0.0", "devDependencies": {}, "dependencies": {}}'
  );
  execSync("time npm i", { encoding: "utf-8" });
}

const packageConfig = JSON.parse(fs.readFileSync("./package.json").toString());

for (let plugin of (process.env.BSB_PLUGINS || "").split(",")) {
  console.log("INSTALL PLUGIN?: " + plugin);
  let pluginString = plugin.split(":");
  let existingPlugin = null;
  for (let ePlugin of Object.keys(packageConfig.dependencies)) {
    if (pluginString[0] === ePlugin) {
      existingPlugin = packageConfig.dependencies[ePlugin];
      break;
    }
  }

  let installString = pluginString[0];
  if (pluginString.length > 1) installString += `@${pluginString[1]}`;
  if (existingPlugin === null) {
    console.log("INSTALL PLUGIN: " + installString);
    // not found, we need to install
    execSync(`time npm install ${installString}`, { encoding: "utf-8" });
  } else {
    if (pluginString.length > 1 && pluginString[1] !== existingPlugin) {
      console.log("UPDATE PLUGIN: " + installString);
      // version specific, so lets see if we need to update
      execSync(`time npm install ${installString}`, { encoding: "utf-8" });
    }
  }
}

/*if ((process.env.BSB_PLUGINS || "").length > 3) {
  console.log("INSTALL PLUGINS: DEPS");
  execSync(`time pnpm i`, { encoding: "utf-8" });
}*/

if (
  ["yes", "y", "true"].indexOf(
    (process.env.BSB_PLUGIN_UPDATE || "").toLowerCase()
  )
) {
  console.log("UPDATE PLUGINS");
  execSync(`time npm update`, { encoding: "utf-8" });
}
