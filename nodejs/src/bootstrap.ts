#! /usr/bin/env node

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

import * as yargs from "yargs";
import * as fs from "fs";
import { cwd } from 'process';
import * as path from 'path';

type PluginTypes = 'plugin' | 'logging' | 'events' | 'metrics';
const types: ReadonlyArray<PluginTypes> = ['plugin', 'logging', 'events', 'metrics'];

(async () => {
  const SBBaseDir = path.join(cwd(), "./node_modules/@bettercorp/service-base");
  const argv = await yargs.default(process.argv.slice(2))
    .option('type', {
      alias: 't',
      description: 'Type of plugin to create',
      choices: types,
      demandOption: false,
      default: 'plugin'
    })
    .option('name', {
      alias: 'n',
      description: 'Name of plugin to create',
      type: 'string',
      demandOption: true
    })
    .help()
    .alias('help', 'h')
    .argv;

  let pluginName = argv.name;
  if (argv.type === 'events' && pluginName.indexOf('events-') !== 0) {
    pluginName = `events-${ pluginName }`;
  } else if (argv.type === 'logger' && pluginName.indexOf('log-') !== 0) {
    pluginName = `log-${ pluginName }`;
  } else if (argv.type === 'plugin') {
    if (pluginName.indexOf('events-') === 0)
      pluginName = pluginName.substring(7);
    if (pluginName.indexOf('log-') === 0)
      pluginName = pluginName.substring(4);
  }

  const dstPluginDir = path.join(cwd(), 'src/plugins', pluginName);

  if (fs.existsSync(dstPluginDir)) {
    throw `Plugin ${ pluginName } already exists!`;
  }

  let srcCode: string = fs.readFileSync(path.join(SBBaseDir, 'templates', `${ argv.type }.ts`)).toString();
  srcCode = srcCode.replace(/demo/g, pluginName);

  fs.mkdirSync(dstPluginDir);
  fs.writeFileSync(path.join(dstPluginDir, 'plugin.ts'), srcCode);
  fs.copyFileSync(path.join(SBBaseDir, 'templates', 'sec.config.ts'), path.join(dstPluginDir, 'sec.config.ts'));

  console.log(`New plugin created ${ pluginName } of type ${ argv.type }`);

  const secConfigFile = path.join(path.join(cwd(), './sec.config.js'));
  if (!fs.existsSync(secConfigFile)) {
    console.log('Init sec.config.json');
    const installer = path.join(SBBaseDir, "./lib/initAppConfig.js");
    console.log("INIT CONFIG : " + installer);
    require(installer); // eslint-disable-line @typescript-eslint/no-var-requires
  }
  const installer = path.join(SBBaseDir, "./lib/ServiceBase.js");
  console.log("INSTALL FINAL : AUTOLOAD: " + installer);
  const ServiceBase = require(installer); // eslint-disable-line @typescript-eslint/no-var-requires
  const SB = new ServiceBase.default(cwd());
  SB.config().then(() => console.log("INSTALL COMPLETE FOR @bettercorp/service-base")).catch(() => process.exit(1));

  console.log(`New plugin setup ${ pluginName } of type ${ argv.type }`);
  console.log(`Enable the plugin in the /sec.config.json file`);

  console.log(`New plugin created ${ pluginName } of type ${ argv.type } successfully`);
})();