/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2024 BetterCorp (PTY) Ltd  
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Alternatively, you may obtain a commercial license for this program. 
 * The commercial license allows you to use the Program in a closed-source manner, 
 * including the right to create derivative works that are not subject to the terms 
 * of the AGPL. 
 *
 * To obtain a commercial license, please contact the copyright holders at 
 * https://www.bettercorp.dev. The terms and conditions of the commercial license 
 * will be provided upon request.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

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

for (let plugin of (process.env.BSB_PLUGINS || "")
  .split(",")
  .filter((x) => x != "")) {
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
  ) >= 0
) {
  console.log("UPDATE PLUGINS");
  execSync(`time npm update`, { encoding: "utf-8" });
}
