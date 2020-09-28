import * as FS from 'fs';
import * as PATH from 'path';
import { DefaultLogger } from './DefaultLogger';
import { Tools } from '@bettercorp/tools/lib/Tools';
import { IDictionary } from '@bettercorp/tools/lib/Interfaces';
import { IEmitter, IEvents, ILogger, IPlugin, ServiceConfig, ServiceConfigPlugins } from "./ILib";
import { DefaultEvents } from './DefaultEvents';

const corePluginName = 'self';
const CWD = process.env.APP_DIR || process.cwd();
const PACKAGE_JSON = PATH.join(CWD, './package.json');
const _version = JSON.parse(FS.readFileSync(PACKAGE_JSON).toString()).version;
let _runningInDebug = true;

const appConfig = JSON.parse(process.env.CONFIG_OBJECT || FS.readFileSync(process.env.CONFIG_FILE || PATH.join(CWD, "./sec.config.json")).toString()) as ServiceConfig;

if (!Tools.isNullOrUndefined(appConfig.debug)) {
  _runningInDebug = appConfig.debug;
}
if (process.env.FORCE_DEBUG !== undefined && process.env.FORCE_DEBUG !== null && process.env.FORCE_DEBUG == '1') {
  _runningInDebug = true;
}

appConfig.debug = _runningInDebug;
let pluginsDir = PATH.join(CWD, 'src');
if (!FS.existsSync(pluginsDir) || !FS.statSync(pluginsDir).isDirectory()) {
  pluginsDir = PATH.join(CWD, 'lib');
}

pluginsDir = PATH.join(pluginsDir, './plugins');
const LIBRARY_PLUGINS: IDictionary<IPlugin> = {};

const cnull = () => { };

let defaultLog = new DefaultLogger();
defaultLog.init(null!); // We know the default logger is using console, so we don't need the plugin features passed through
let logger: ILogger = new DefaultLogger();
let loggerName: string | null = null;

let events: IEvents = new DefaultEvents();
let eventsName: string | null = null;

defaultLog.info(corePluginName, ' - BOOT UP: @' + _version);
if (appConfig.debug)
  defaultLog.info(corePluginName, ' - RUNNING IN DEBUG MODE');

const SETUP_PLUGINS = () => new Promise(async (resolve) => {
  const loggerPluginName = loggerName || 'default-logger';
  logger.init({
    log: defaultLog,
    pluginName: loggerPluginName,
    cwd: CWD,
    config: appConfig,
    getPluginConfig: <T = ServiceConfigPlugins> (): T => appConfig.plugins[loggerPluginName] as T,
    onEvent: <T = any> (plugin: string, event: string, listener: (data: IEmitter<T>) => void) => events.onEvent<T>(loggerPluginName, plugin, event, listener),
    emitEvent: <T = any> (plugin: string, event: string, data?: T) => events.emitEvent<T>(loggerPluginName, plugin, event, data),
    emitEventAndReturn: <T1 = any, T2 = any> (plugin: string, event: string, data?: T1) => events.emitEventAndReturn<T1, T2>(loggerPluginName, plugin, event, data)
  });
  if (loggerName !== null) {
    defaultLog.info(corePluginName, `Logging moved to plugin: ${loggerName}`);
  }
  const eventsPluginName = eventsName || 'default-events';
  events.init({
    log: logger,
    pluginName: eventsPluginName,
    cwd: CWD,
    config: appConfig,
    getPluginConfig: <T = ServiceConfigPlugins> (): T => appConfig.plugins[eventsPluginName] as T,
    onEvent: <T = any> (plugin: string, event: string, listener: (data: IEmitter<T>) => void) => events.onEvent<T>(eventsPluginName, plugin, event, listener),
    emitEvent: <T = any> (plugin: string, event: string, data?: T) => events.emitEvent<T>(eventsPluginName, plugin, event, data),
    emitEventAndReturn: <T1 = any, T2 = any> (plugin: string, event: string, data?: T1) => events.emitEventAndReturn<T1, T2>(eventsPluginName, plugin, event, data)
  });
  if (eventsName !== null) {
    defaultLog.info(corePluginName, `Events moved to plugin: ${eventsName}`);
  }

  for (let pluginName of Object.keys(LIBRARY_PLUGINS)) {
    let plugin = LIBRARY_PLUGINS[pluginName];
    defaultLog.info(corePluginName, `Setup Plugin: ${pluginName}`);
    defaultLog.info(corePluginName, ` - INIT`);
    plugin.init({
      pluginName,
      log: {
        debug: (...data: any[]) => !_runningInDebug ?
          cnull()
          : (!Tools.isNullOrUndefined(plugin.log)
            ? plugin.log!.debug(pluginName, data)
            : logger.debug(pluginName, data)),
        info: (...data: any[]) => (!Tools.isNullOrUndefined(plugin.log)
          ? plugin.log!.info(pluginName, data)
          : logger.info(pluginName, data)),
        error: (...data: any[]) => (!Tools.isNullOrUndefined(plugin.log)
          ? plugin.log!.error(pluginName, data)
          : logger.error(pluginName, data)),
        warn: (...data: any[]) => (!Tools.isNullOrUndefined(plugin.log)
          ? plugin.log!.warn(pluginName, data)
          : logger.warn(pluginName, data))
      },
      cwd: CWD,
      config: appConfig,
      getPluginConfig: <T = ServiceConfigPlugins> (): T => appConfig.plugins[pluginName] as T,
      onEvent: <T = any> (plugin: string, event: string, listener: (data: IEmitter<T>) => void) => events.onEvent<T>(pluginName, plugin, event, listener),
      emitEvent: <T = any> (plugin: string, event: string, data?: T) => events.emitEvent<T>(pluginName, plugin, event, data),
      emitEventAndReturn: <T1 = any, T2 = any> (plugin: string, event: string, data?: T1) => events.emitEventAndReturn<T1, T2>(pluginName, plugin, event, data)
    });
    defaultLog.info(corePluginName, ' - DONE');
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
      defaultLog.info(corePluginName, ` - IGNORE PLUGIN [${name}] - defined in package.json`);
      return;
    }
  }

  if (!Tools.isNullOrUndefined(LIBRARY_PLUGINS[name])) {
    throw new Error(`Cannot have 2 plugins with the same name!! [${name}]`);
  }

  let importedPlugin = require(path);
  defaultLog.info(corePluginName, ` - ${name}: LOADED`);
  LIBRARY_PLUGINS[name] = new importedPlugin.Plugin();
};
const loadCorePlugin = (name: string, path: string) => {
  if (Tools.isNullOrUndefined(packageJSON[packageJSONPluginsObjName][name])) {
    packageJSON[packageJSONPluginsObjName][name] = true;
    packageChanges = true;
  } else {
    if (packageJSON[packageJSONPluginsObjName][name] == false) {
      defaultLog.info(corePluginName, ` - IGNORE PLUGIN [${name}] - defined in package.json`);
      return;
    }
  }

  if (name.indexOf('log-') === 0) {
    let importedPlugin = require(path);
    defaultLog.info(corePluginName, ` - ${name}: LOADED AS DEFAULT LOGGER`);
    logger = importedPlugin;
    loggerName = name;
    return;
  }
  if (name.indexOf('events-') === 0) {
    let importedPlugin = require(path);
    defaultLog.info(corePluginName, ` - ${name}: LOADED AS EVENTS HANDLER`);
    events = importedPlugin;
    eventsName = name;
    return;
  }

  defaultLog.warn(corePluginName, `Plugin (${name}) was ignored as it's not a valid core plugin... contact support@bettercorp.co.za.`);
};

const loadPlugins = (path: string): void => {
  defaultLog.info(corePluginName, `Load plugins in: ${path}`);
  for (let dirFileWhat of FS.readdirSync(path)) {
    if (FS.statSync(PATH.join(path, dirFileWhat)).isDirectory()) {
      if (dirFileWhat.indexOf('-') === 0) {
        defaultLog.info(corePluginName, ` - IGNORE [${dirFileWhat}]`);
        continue;
      }
      let pluginFile = PATH.join(path, dirFileWhat, 'plugin.ts');
      if (!FS.existsSync(pluginFile))
        pluginFile = PATH.join(path, dirFileWhat, 'plugin.js');
      if (!FS.existsSync(pluginFile))
        continue;

      if (CORE_PLUGINS.indexOf(dirFileWhat) >= 0)
        loadCorePlugin(dirFileWhat, pluginFile);
      else
        loadPlugin(dirFileWhat, pluginFile);
    }
  }
};

const CORE_PLUGINS = ['log', ' events'];

export default class ServiceBase {
  init (): void {
    const npmPluginsDir = PATH.join(CWD, './node_modules/@bettercorp');
    defaultLog.info(corePluginName, `Load NPM plugins in: ${npmPluginsDir}`);
    for (let dirFileWhat of FS.readdirSync(npmPluginsDir)) {
      if (FS.statSync(PATH.join(npmPluginsDir, dirFileWhat)).isDirectory()) {
        if (dirFileWhat.indexOf('service-base') != 0) {
          defaultLog.info(corePluginName, ` - IGNORE [${dirFileWhat}]`);
          continue;
        }
        const innerPluginLib = PATH.join(npmPluginsDir, dirFileWhat, './lib');
        if (!FS.existsSync(innerPluginLib) || !FS.statSync(innerPluginLib).isDirectory()) {
          defaultLog.info(corePluginName, ` - IGNORE [${dirFileWhat}]`);
          continue;
        }
        const innerPluginLibPlugin = PATH.join(innerPluginLib, './plugins');
        if (!FS.existsSync(innerPluginLibPlugin)) {
          let pluginFile = PATH.join(innerPluginLib, 'plugin.ts');
          if (!FS.existsSync(pluginFile))
            pluginFile = PATH.join(innerPluginLib, 'plugin.js');
          if (!FS.existsSync(pluginFile)) {
            defaultLog.info(corePluginName, ` - IGNORE [${dirFileWhat}]`);
            continue;
          }

          loadPlugin(dirFileWhat.replace('service-base-', ''), pluginFile);
          continue;
        }
        if (!FS.statSync(innerPluginLibPlugin).isDirectory()) {
          defaultLog.info(corePluginName, ` - IGNORE [${dirFileWhat}]`);
          continue;
        }

        loadPlugins(innerPluginLibPlugin);
      }
    }

    defaultLog.info(corePluginName, `Load app plugins in: ${pluginsDir}`);
    loadPlugins(pluginsDir);

    if (packageChanges) {
      FS.writeFileSync(PACKAGE_JSON, JSON.stringify(packageJSON));
    }
  }

  async run (): Promise<void> {
    defaultLog.info(corePluginName, 'Setup plugins');
    await SETUP_PLUGINS();

    defaultLog.info(corePluginName, 'App Ready');
  }
}