import * as yargs from "yargs";
import * as fs from "fs";
import { cwd } from 'process';
import * as path from 'path';

type PluginTypes = 'plugin' | 'logger' | 'events';
const types: ReadonlyArray<PluginTypes> = ['plugin', 'logger', 'events'];

(async () => {
  const SBBaseDir = path.join(cwd(), "./node_modules/@bettercorp/service-base");
  const argv = await yargs(process.argv.slice(2))
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

  const installer = path.join(SBBaseDir, "./lib/ServiceBase.js");
  console.log("INSTALL FINAL : AUTOLOAD: " + installer);
  const ServiceBase = require(installer);
  const SB = new ServiceBase.default(cwd());
  SB.config().then(() => console.log("INSTALL COMPLETE FOR @bettercorp/service-base")).catch(() => process.exit(1));

  console.log(`New plugin setup ${ pluginName } of type ${ argv.type }`);
  console.log(`Enable the plugin in the /sec.config.json file`);
})();