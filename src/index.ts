import * as EVENT_EMITTER from 'events';
import * as FS from 'fs';
import * as PATH from 'path';
import { Tools } from '@bettercorp/tools/lib/Tools';
import { IDictionary } from '@bettercorp/tools/lib/Interfaces';
import { ILOGGER, IPlugin } from "./ILib";
import { v4 as UUID } from 'uuid';

const CWD = process.env.APP_DIR || process.cwd();
const PACKAGE_JSON = PATH.join(CWD, './package.json');
const _version = JSON.parse(FS.readFileSync(PACKAGE_JSON).toString()).version;
let _runningInDebug = true;

const appConfig = JSON.parse(process.env.CONFIG_OBJECT || FS.readFileSync(process.env.CONFIG_FILE || PATH.join(CWD, "./sec.config.json")) as any);

if (!Tools.isNullOrUndefined(appConfig.debug)) {
  _runningInDebug = appConfig.debug as boolean;
}
if (process.env.FORCE_DEBUG !== undefined && process.env.FORCE_DEBUG !== null && process.env.FORCE_DEBUG == '1') {
  _runningInDebug = true;
}

let pluginsDir = PATH.join(CWD, _runningInDebug ? 'src' : 'lib', './plugins');
const LIBRARY_PLUGINS: IDictionary<IPlugin> = {};
const INTERNAL_EVENTS = new (EVENT_EMITTER as any)();

const CORE_PLUGINS = ['logging'];

let loggerPlugin: string | null = PATH.join(pluginsDir, `./${CORE_PLUGINS[0]}/plugin`);
if (FS.existsSync(`${loggerPlugin}.ts`)) {
  loggerPlugin = `${loggerPlugin}.ts`;
} else if (FS.existsSync(`${loggerPlugin}.js`)) {
  loggerPlugin = `${loggerPlugin}.js`;
} else {
  loggerPlugin = null;
}

let logger: ILOGGER = {
  info: (pluginName: string, ...data: any[]) => typeof data === 'string'
    ? console.log(`[${pluginName.toUpperCase()}] ${data}`)
    : console.log(pluginName.toUpperCase(), data),
  error: (pluginName: string, ...data: any[]) => typeof data === 'string'
    ? console.error(`[${pluginName.toUpperCase()}] ${data}`)
    : console.error(pluginName.toUpperCase(), data),
  warn: (pluginName: string, ...data: any[]) => typeof data === 'string'
    ? console.warn(`[${pluginName.toUpperCase()}] ${data}`)
    : console.warn(pluginName.toUpperCase(), data)
};
if (!Tools.isNullOrUndefined(loggerPlugin)) {
  logger = require(loggerPlugin!).default;
}

console.log(' - BOOT UP: @' + _version);

const SETUP_PLUGINS = () => new Promise(async (resolve) => {
  for (let pluginName of Object.keys(LIBRARY_PLUGINS)) {
    let plugin = LIBRARY_PLUGINS[pluginName];
    console.log(`Setup Plugin: ${pluginName}`);
    if (plugin.init) {
      console.log(` - INIT`);
      plugin.init({
        log: {
          info: (...data: any[]) => !Tools.isNullOrUndefined(plugin.log)
            ? plugin.log!.info(pluginName, data)
            : logger.info(pluginName, data),
          error: (...data: any[]) => !Tools.isNullOrUndefined(plugin.log)
            ? plugin.log!.error(pluginName, data)
            : logger.error(pluginName, data),
          warn: (...data: any[]) => !Tools.isNullOrUndefined(plugin.log)
            ? plugin.log!.warn(pluginName, data)
            : logger.warn(pluginName, data)
        },
        cwd: CWD,
        events: INTERNAL_EVENTS,
        config: appConfig,
        onEvent: (event: string, endpoint: string | null = null, listener: (...args: any[]) => void, global: Boolean = false) => {
          console.log(` - LISTEN: [${global ? event : `${endpoint !== null ? `${endpoint}-` : ''}${pluginName}-${event}`}]`);
          INTERNAL_EVENTS.on(global ? event : `${endpoint !== null ? `${endpoint}-` : ''}${pluginName}-${event}`, listener);
        },
        emitEvent: (event: string, ...args: any[]) => {
          INTERNAL_EVENTS.emit(event, ...args);
        },
        emitEventAndReturn: (event: string, endpointOrPluginName: string, timeoutSeconds: number = 10, args: any) => new Promise((resolve, reject) => {
          const resultKey = UUID();
          const endEventName = `${endpointOrPluginName}-${event}-result-${resultKey}`;
          const errEventName = `${endpointOrPluginName}-${event}-error-${resultKey}`;

          let timeoutTimer = setTimeout(() => {
            if (timeoutTimer === null) return;
            INTERNAL_EVENTS.removeListener(endEventName, () => { });
            INTERNAL_EVENTS.removeListener(errEventName, () => { });
            reject(`NO RESPONSE IN TIME: ${endEventName} x${timeoutSeconds || 10}s`);
          }, (timeoutSeconds || 10) * 1000);
          INTERNAL_EVENTS.once(errEventName, (args: any) => {
            clearTimeout(timeoutTimer);
            INTERNAL_EVENTS.removeListener(endEventName, () => { });
            INTERNAL_EVENTS.removeListener(errEventName, () => { });
            reject(args);
          });
          INTERNAL_EVENTS.once(endEventName, (args: any) => {
            clearTimeout(timeoutTimer);
            INTERNAL_EVENTS.removeListener(endEventName, () => { });
            INTERNAL_EVENTS.removeListener(errEventName, () => { });
            resolve(args);
          });
          INTERNAL_EVENTS.emit(`${endpointOrPluginName}-${event}`, {
            resultKey: resultKey,
            ...args
          });
        })
      });
    }
    console.log(' - DONE');
  }
  resolve();
});

const packageJSONPluginsObjName = 'bettercorp-service-base';
let packageJSON = JSON.parse(FS.readFileSync(PACKAGE_JSON).toString());
let packageChanges = false;

if (Tools.isNullOrUndefined(packageJSON[packageJSONPluginsObjName])) {
  packageJSON[packageJSONPluginsObjName] = {};
  packageChanges = true;
}

const loadPlugin = (name: string, path: string) => {
  if (Tools.isNullOrUndefined(packageJSON[packageJSONPluginsObjName][name])) {
    packageJSON[packageJSONPluginsObjName][name] = true;
    packageChanges = true;
  } else {
    if (packageJSON[packageJSONPluginsObjName][name] == false) {
      console.log(` - IGNORE PLUGIN [${name}] - defined in package.json`);
      return;
    }
  }

  if (!Tools.isNullOrUndefined(LIBRARY_PLUGINS[name])) {
    throw new Error(`Cannot have 2 plugins with the same name!! [${name}]`);
  }

  let importedPlugin = require(path);
  console.log(` - ${name}: LOADED`);
  LIBRARY_PLUGINS[name] = importedPlugin;
};
const loadPlugins = (path: string): void => {
  console.log(`Load plugins in: ${path}`);
  for (let dirFileWhat of FS.readdirSync(path)) {
    if (FS.statSync(PATH.join(path, dirFileWhat)).isDirectory()) {
      if (dirFileWhat.indexOf('-') === 0) {
        console.log(` - IGNORE [${dirFileWhat}]`);
        continue;
      }
      if (CORE_PLUGINS.indexOf(dirFileWhat) > 0) {
        console.log(` - IGNORE CORE PLUGIN [${dirFileWhat}]`);
        continue;
      }
      let pluginFile = PATH.join(path, dirFileWhat, 'plugin.ts');
      if (!FS.existsSync(pluginFile))
        pluginFile = PATH.join(path, dirFileWhat, 'plugin.js');
      if (!FS.existsSync(pluginFile))
        continue;

      loadPlugin(dirFileWhat, pluginFile);
    }
  }
};

export default class ServiceBase {
  init (): void {

    const npmPluginsDir = PATH.join(CWD, './node_modules/@bettercorp');
    console.log(`Load NPM plugins in: ${npmPluginsDir}`);
    for (let dirFileWhat of FS.readdirSync(npmPluginsDir)) {
      if (FS.statSync(PATH.join(npmPluginsDir, dirFileWhat)).isDirectory()) {
        if (dirFileWhat.indexOf('service-base') != 0) {
          console.log(` - IGNORE [${dirFileWhat}]`);
          continue;
        }
        const innerPluginLib = PATH.join(npmPluginsDir, dirFileWhat, './lib');
        if (!FS.existsSync(innerPluginLib) || !FS.statSync(innerPluginLib).isDirectory()) {
          console.log(` - IGNORE [${dirFileWhat}]`);
          continue;
        }
        const innerPluginLibPlugin = PATH.join(innerPluginLib, './plugins');
        if (!FS.existsSync(innerPluginLibPlugin)) {
          let pluginFile = PATH.join(innerPluginLib, 'plugin.ts');
          if (!FS.existsSync(pluginFile))
            pluginFile = PATH.join(innerPluginLib, 'plugin.js');
          if (!FS.existsSync(pluginFile)) {
            console.log(` - IGNORE [${dirFileWhat}]`);
            continue;
          }

          loadPlugin(dirFileWhat.replace('service-base-', ''), pluginFile);
          continue;
        }
        if (!FS.statSync(innerPluginLibPlugin).isDirectory()) {
          console.log(` - IGNORE [${dirFileWhat}]`);
          continue;
        }

        loadPlugins(innerPluginLibPlugin);
      }
    }

    console.log(`Load app plugins in: ${pluginsDir}`);
    loadPlugins(pluginsDir);

    if (packageChanges) {
      FS.writeFileSync(PACKAGE_JSON, JSON.stringify(packageJSON));
    }
  }

  async run (): Promise<void> {
    console.log('Setup plugins');
    await SETUP_PLUGINS();

    console.log('App Ready');
  }
}