import * as FS from 'fs';
import * as PATH from 'path';
import { Logger as DefaultLogger } from './DefaultLogger';
import { Tools } from '@bettercorp/tools/lib/Tools';
import { IDictionary } from '@bettercorp/tools/lib/Interfaces';
import { IEvents, ILogger, IPlugin, ServiceConfig, ServiceConfigPlugins } from "./ILib";
import { Events as DefaultEvents } from './DefaultEvents';

const corePluginName = 'self';
const CWD = process.env.APP_DIR || process.cwd();
const PACKAGE_JSON = PATH.join(CWD, './package.json');
const packageJSON = JSON.parse(FS.readFileSync(PACKAGE_JSON).toString());
const _version = packageJSON.version;
let packageChanges = false;
let configChanges = false;
let _runningInDebug = true;
let _runningInPluginDebug = false;

const cnull = () => { };

let defaultLog = new DefaultLogger(); // Default logger does not require init to be called ... so we're being lazy and not calling it.
let logger: ILogger = new DefaultLogger();
let loggerName: string | null = null;

let events: IEvents = new DefaultEvents();
let eventsName: string | null = null;

const packageJSONPluginsObjName = 'bettercorp-service-base';
defaultLog.info(corePluginName, 'BOOT UP: @' + _version);

let canWriteChanges = true;
if (!Tools.isNullOrUndefined(process.env.BSB_LIVE)) {
  canWriteChanges = false;
}
let secConfigJsonFile = PATH.join(CWD, "./sec.config.json");
let deploymentProfile: string = 'default';
if (!Tools.isNullOrUndefined(process.env.BSB_PROFILE)) {
  deploymentProfile = process.env.BSB_PROFILE!;
}
if (deploymentProfile !== 'default') {
  secConfigJsonFile = PATH.join(CWD, `./sec.config.${ deploymentProfile }.json`);
}
if (!Tools.isNullOrUndefined(process.env.BSB_SEC_JSON)) {
  secConfigJsonFile = process.env.BSB_SEC_JSON!;
}
const secConfigJsonInstallerFile = PATH.join(CWD, "./installer.js");
let debugConfig: any = undefined;
if (!FS.existsSync(secConfigJsonFile)) {
  defaultLog.error('! sec.config.json CAN`T BE FOUND !');
  if (FS.existsSync(secConfigJsonInstallerFile)) {
    // running in debug mode
    _runningInPluginDebug = true;
    defaultLog.error('! RUNNING IN DEBUG PLUGIN MODE !');
    defaultLog.error('WE WILL USE PLUGIN DEFAULTS');
    let pluginScript = require(secConfigJsonInstallerFile);
    if (pluginScript.default !== undefined)
      pluginScript = pluginScript.default;

    let pluginName = packageJSON.name.split('@bettercorp/service-base-')[1].toLowerCase();
    let testPluginName = `${ pluginName }-test`;
    defaultLog.error(`Plugin setup as : ${ pluginName } & ${ testPluginName }`);
    debugConfig = {};
    debugConfig.plugins = debugConfig.plugins || {};
    debugConfig.enabledPlugins = debugConfig.enabledPlugins || {};
    debugConfig.mappedPlugins = debugConfig.mappedPlugins || {};
    debugConfig.plugins[pluginName] = pluginScript(pluginName);
    debugConfig.enabledPlugins[pluginName] = true;
    debugConfig.mappedPlugins[pluginName] = pluginName;
    debugConfig.plugins[testPluginName] = pluginScript(pluginName);
    debugConfig.enabledPlugins[testPluginName] = true;
    debugConfig.mappedPlugins[testPluginName] = testPluginName;
  } else {
    throw '! sec.config.json CAN`T BE FOUND !';
  }
}
const appConfig = debugConfig || JSON.parse(process.env.CONFIG_OBJECT || FS.readFileSync(process.env.CONFIG_FILE || secConfigJsonFile).toString()) as ServiceConfig;

if (!Tools.isNullOrUndefined(appConfig.debug)) {
  _runningInDebug = appConfig.debug;
}
if (process.env.FORCE_DEBUG !== undefined && process.env.FORCE_DEBUG !== null && process.env.FORCE_DEBUG == '1') {
  _runningInDebug = true;
}

appConfig.debug = _runningInDebug;
appConfig.enabledPlugins = appConfig.enabledPlugins || {};
if (Tools.isArray(appConfig.enabledPlugins)) { // upgrade path
  appConfig.enabledPlugins = {};
}
appConfig.mappedPlugins = appConfig.mappedPlugins || {};
let pluginsDir = PATH.join(CWD, 'src');
if (!FS.existsSync(pluginsDir) || !FS.statSync(pluginsDir).isDirectory()) {
  pluginsDir = PATH.join(CWD, 'lib');
}

pluginsDir = PATH.join(pluginsDir, './plugins');
const LIBRARY_PLUGINS: IDictionary<IPlugin> = {};

if (appConfig.debug)
  defaultLog.info(corePluginName, 'RUNNING IN DEBUG MODE');

let updateAppConfig = (plugin?: string) => {
  if (!Tools.isNullOrUndefined(plugin) && Tools.isNullOrUndefined(appConfig.mappedPlugins[plugin!])) {
    appConfig.mappedPlugins[plugin!] = plugin;
    configChanges = true;
  }
  if (canWriteChanges && configChanges) {
    defaultLog.error('SEC CONFIG AUTOMATICALLY UPDATED.');
    FS.writeFileSync(secConfigJsonFile, JSON.stringify(appConfig));
    configChanges = false;
  }
};

const SETUP_PLUGINS = (): Promise<void> => new Promise(async (resolve) => {
  const loggerPluginName = loggerName || 'default-logger';
  defaultLog.info(corePluginName, `Activating logs on with: ${ loggerPluginName }`);
  await logger.init({
    log: {
      debug: (...data: any[]) => !_runningInDebug ?
        cnull()
        : defaultLog.debug(loggerPluginName, data),
      info: (...data: any[]) => defaultLog.info(loggerPluginName, data),
      error: (...data: any[]) => defaultLog.error(loggerPluginName, data),
      warn: (...data: any[]) => defaultLog.warn(loggerPluginName, data)
    },
    pluginName: loggerPluginName,
    cwd: CWD,
    config: appConfig,
    getPluginConfig: <T = ServiceConfigPlugins>(): T => appConfig.plugins[loggerPluginName] as T,
    onEvent: <T = any>(plugin: string, event: string, listener: (data: T) => void): void => {
      updateAppConfig(plugin);
      return events.onEvent<T>(loggerPluginName, appConfig.mappedPlugins[plugin], event, listener);
    },
    onReturnableEvent: <T = any>(plugin: string, event: string, listener: (resolve: Function, reject: Function, data: T) => void): void => {
      updateAppConfig(plugin);
      return events.onReturnableEvent<T>(loggerPluginName, appConfig.mappedPlugins[plugin], event, listener);
    },
    emitEvent: <T = any>(plugin: string, event: string, data?: T) => {
      updateAppConfig(plugin);
      return events.emitEvent<T>(loggerPluginName, appConfig.mappedPlugins[plugin], event, data);
    },
    emitEventAndReturn: <T1 = any, T2 = void>(plugin: string, event: string, data?: T1, timeoutSeconds?: number) => {
      updateAppConfig(plugin);
      return events.emitEventAndReturn<T1, T2>(loggerPluginName, appConfig.mappedPlugins[plugin], event, data, timeoutSeconds);
    },
    initForPlugins: <T1 = any, T2 = void>(pluginName: string, initType: string | null, args: T1): Promise<T2> => new Promise((resolve, reject) => {
      reject('NOT VALID FOR LOGGING CONTEXT');
    })
  });
  if (loggerName !== null) {
    defaultLog.info(corePluginName, `Logging moved to plugin: ${ loggerName }`);
  }
  const eventsPluginName = eventsName || 'default-events';
  defaultLog.info(corePluginName, `Activating events on with: ${ eventsPluginName }`);
  await events.init({
    log: {
      debug: (...data: any[]) => !_runningInDebug ?
        cnull()
        : logger.debug(eventsPluginName, data),
      info: (...data: any[]) => (!Tools.isNullOrUndefined(events.log)
        ? events.log!.info(eventsPluginName, data)
        : logger.info(eventsPluginName, data)),
      error: (...data: any[]) => (!Tools.isNullOrUndefined(events.log)
        ? events.log!.error(eventsPluginName, data)
        : logger.error(eventsPluginName, data)),
      warn: (...data: any[]) => (!Tools.isNullOrUndefined(events.log)
        ? events.log!.warn(eventsPluginName, data)
        : logger.warn(eventsPluginName, data))
    },
    pluginName: eventsPluginName,
    cwd: CWD,
    config: appConfig,
    getPluginConfig: <T = ServiceConfigPlugins>(): T => appConfig.plugins[eventsPluginName] as T,
    onEvent: <T = any>(plugin: string, event: string, listener: (data: T) => void): void => {
      updateAppConfig(plugin);
      return events.onEvent<T>(eventsPluginName, appConfig.mappedPlugins[plugin], event, listener);
    },
    onReturnableEvent: <T = any>(plugin: string, event: string, listener: (resolve: Function, reject: Function, data: T) => void): void => {
      updateAppConfig(plugin);
      return events.onReturnableEvent<T>(eventsPluginName, appConfig.mappedPlugins[plugin], event, listener);
    },
    emitEvent: <T = any>(plugin: string, event: string, data?: T) => {
      updateAppConfig(plugin);
      return events.emitEvent<T>(eventsPluginName, appConfig.mappedPlugins[plugin], event, data);
    },
    emitEventAndReturn: <T1 = any, T2 = void>(plugin: string, event: string, data?: T1, timeoutSeconds?: number) => {
      updateAppConfig(plugin);
      return events.emitEventAndReturn<T1, T2>(eventsPluginName, appConfig.mappedPlugins[plugin], event, data, timeoutSeconds);
    },
    initForPlugins: <T1 = any, T2 = void>(pluginName: string, initType: string | null, args: T1): Promise<T2> => new Promise((resolve, reject) => {
      reject('NOT VALID FOR EVENTS CONTEXT');
    })
  });
  if (eventsName !== null) {
    defaultLog.info(corePluginName, `Events moved to plugin: ${ eventsName }`);
  }

  let initPlugins = Object.keys(LIBRARY_PLUGINS);
  let loadedPlugins = Object.keys(LIBRARY_PLUGINS);
  for (let i = 0; i < initPlugins.length; i++) {
    if (Tools.isNullOrUndefined(LIBRARY_PLUGINS[initPlugins[i]].initIndex)) {
      defaultLog.info(`Set ${ initPlugins[i] } to initIndex of ${ -1 }`);
      LIBRARY_PLUGINS[initPlugins[i]].initIndex = -1;
    }
    if (Tools.isNullOrUndefined(LIBRARY_PLUGINS[loadedPlugins[i]].loadedIndex)) {
      defaultLog.info(`Set ${ initPlugins[i] } to loadIndex of ${ -1 }`);
      LIBRARY_PLUGINS[loadedPlugins[i]].loadedIndex = -1;
    }
    if (loadedPlugins[i].indexOf('plugin-') >= 0) {
      LIBRARY_PLUGINS[initPlugins[i]].initIndex!--;
      LIBRARY_PLUGINS[initPlugins[i]].loadedIndex!++;
      defaultLog.info(`Update ${ initPlugins[i] } to init/load of ${ LIBRARY_PLUGINS[initPlugins[i]].initIndex }/${ LIBRARY_PLUGINS[initPlugins[i]].loadedIndex }`);
    }
  }
  for (let i = 0; i < initPlugins.length - 1; i++) {
    for (let j = i + 1; j < initPlugins.length; j++) {
      if (LIBRARY_PLUGINS[initPlugins[i]].initIndex! > LIBRARY_PLUGINS[initPlugins[j]].initIndex!) {
        let temp = initPlugins[i];
        initPlugins[i] = initPlugins[j];
        initPlugins[j] = temp;
      }
    }
  }
  for (let i = 0; i < loadedPlugins.length - 1; i++) {
    for (let j = i + 1; j < loadedPlugins.length; j++) {
      if (LIBRARY_PLUGINS[loadedPlugins[i]].loadedIndex! > LIBRARY_PLUGINS[loadedPlugins[j]].loadedIndex!) {
        let temp = loadedPlugins[i];
        loadedPlugins[i] = loadedPlugins[j];
        loadedPlugins[j] = temp;
      }
    }
  }

  defaultLog.info('Init Order: ' + initPlugins.join(','));
  for (let pluginName of initPlugins) {
    defaultLog.info(`  - [${ LIBRARY_PLUGINS[pluginName].initIndex! }] ${ pluginName }`);
  }
  defaultLog.info('Loaded Order: ' + loadedPlugins.join(','));
  for (let pluginName of loadedPlugins) {
    defaultLog.info(`  - [${ LIBRARY_PLUGINS[pluginName].initIndex! }] ${ pluginName }`);
  }

  for (let pluginName of initPlugins) {
    let plugin = LIBRARY_PLUGINS[pluginName];
    defaultLog.info(corePluginName, `Setup Plugin: ${ pluginName }`);
    if (!_runningInDebug && pluginName.endsWith('-test')) {
      defaultLog.info(corePluginName, `Plugin is a test plugin, and we're running in prod... so don't load: ${ pluginName }`);
    }
    defaultLog.info(corePluginName, ` - INIT`);
    await plugin.init({
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
      getPluginConfig: <T = ServiceConfigPlugins>(): T => appConfig.plugins[pluginName] as T,
      onEvent: <T = any>(plugin: string, event: string, listener: (data: T) => void): void => {
        updateAppConfig(plugin);
        return events.onEvent<T>(pluginName, appConfig.mappedPlugins[plugin], event, listener);
      },
      onReturnableEvent: <T = any>(plugin: string, event: string, listener: (resolve: Function, reject: Function, data: T) => void): void => {
        updateAppConfig(plugin);
        return events.onReturnableEvent<T>(pluginName, appConfig.mappedPlugins[plugin], event, listener);
      },
      emitEvent: <T = any>(plugin: string, event: string, data?: T): void => {
        updateAppConfig(plugin);
        return events.emitEvent<T>(pluginName, appConfig.mappedPlugins[plugin], event, data)
      },
      emitEventAndReturn: <T1 = any, T2 = any>(plugin: string, event: string, data?: T1, timeoutSeconds?: number): Promise<T2> => {
        updateAppConfig(plugin);
        return events.emitEventAndReturn<T1, T2>(pluginName, appConfig.mappedPlugins[plugin], event, data, timeoutSeconds);
      },
      initForPlugins: <T1 = any, T2 = void>(pluginName: string, initType: string | null, args: T1) => {
        return new Promise((resolve, reject) => {
          if (Tools.isNullOrUndefined(LIBRARY_PLUGINS[pluginName]))
            return reject(`No plugin loaded matching plugin name! [${ pluginName }]`);

          if (Tools.isNullOrUndefined(LIBRARY_PLUGINS[pluginName].initForPlugins) || !Tools.isFunction(LIBRARY_PLUGINS[pluginName].initForPlugins))
            return reject(`No plugin init mech available for plugin! [${ pluginName }]`);

          LIBRARY_PLUGINS[pluginName].initForPlugins!<T1, T2>(initType, args).then(resolve as any).catch(reject);
        });
      }
    });
    defaultLog.info(corePluginName, ' - DONE');
  }
  for (let pluginName of loadedPlugins) {
    let plugin = LIBRARY_PLUGINS[pluginName];
    defaultLog.info(corePluginName, `Setup Plugin: ${ pluginName }`);
    if (Tools.isNullOrUndefined(plugin.loaded)) {
      defaultLog.info(corePluginName, ` - NO LOAD REQUIRED`);
      continue;
    }
    defaultLog.info(corePluginName, ` - LOADED`);
    await plugin.loaded!({
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
      getPluginConfig: <T = ServiceConfigPlugins>(): T => appConfig.plugins[pluginName] as T,
      onEvent: <T = any>(plugin: string, event: string, listener: (data: T) => void): void => {
        updateAppConfig(plugin);
        return events.onEvent<T>(pluginName, appConfig.mappedPlugins[plugin], event, listener);
      },
      onReturnableEvent: <T = any>(plugin: string, event: string, listener: (resolve: Function, reject: Function, data: T) => void): void => {
        updateAppConfig(plugin);
        return events.onReturnableEvent<T>(pluginName, appConfig.mappedPlugins[plugin], event, listener)
      },
      emitEvent: <T = any>(plugin: string, event: string, data?: T): void => {
        updateAppConfig(plugin);
        return events.emitEvent<T>(pluginName, appConfig.mappedPlugins[plugin], event, data)
      },
      emitEventAndReturn: <T1 = any, T2 = any>(plugin: string, event: string, data?: T1, timeoutSeconds?: number): Promise<T2> => {
        updateAppConfig(plugin);
        return events.emitEventAndReturn<T1, T2>(pluginName, appConfig.mappedPlugins[plugin], event, data, timeoutSeconds);
      },
      initForPlugins: <T1 = any, T2 = void>(pluginName: string, initType: string | null, args: T1) => {
        return new Promise((resolve, reject) => {
          if (Tools.isNullOrUndefined(LIBRARY_PLUGINS[pluginName]))
            return reject(`No plugin loaded matching plugin name! [${ pluginName }]`);

          if (Tools.isNullOrUndefined(LIBRARY_PLUGINS[pluginName].initForPlugins) || !Tools.isFunction(LIBRARY_PLUGINS[pluginName].initForPlugins))
            return reject(`No plugin init mech available for plugin! [${ pluginName }]`);

          LIBRARY_PLUGINS[pluginName].initForPlugins!<T1, T2>(initType, args).then(resolve as any).catch(reject);
        });
      }
    });
    defaultLog.info(corePluginName, ' - DONE');
  }
  resolve();
});

const loadPluginConfig = async (name: string, path: string) => {
  let loadedFile = require(path);
  if (loadedFile.default !== undefined)
    loadedFile = loadedFile.default;
  let newConfig = Tools.mergeObjects(loadedFile(name, appConfig.plugins[name]), appConfig.plugins[name]);
  if (JSON.stringify(newConfig) != JSON.stringify(appConfig.plugins[name])) {
    defaultLog.info(corePluginName, ` - PLUGIN [${ name }] SEC CONFIG UPDATED - TRIGGER DEFAULTS UPDATE`);
    configChanges = true;
    appConfig.plugins[name] = newConfig;
  }
};

const loadPlugin = async (name: string, path: string, pluginInstallerFile: string | null) => {
  // upgrade path
  if (!Tools.isNullOrUndefined(packageJSON[packageJSONPluginsObjName])) {
    if (Tools.isBoolean(packageJSON[packageJSONPluginsObjName][name])) {
      appConfig.enabledPlugins[name] = packageJSON[packageJSONPluginsObjName][name];
      delete packageJSON[packageJSONPluginsObjName][name];
      packageChanges = true;
      configChanges = true;
      defaultLog.info(corePluginName, ` - UPGRADE PLUGIN [${ name }] - from package.json state`);
    }
    if (Tools.isString(packageJSON[packageJSONPluginsObjName][name])) {
      appConfig.enabledPlugins[name] = true;
      appConfig.mappedPlugins[name] = packageJSON[packageJSONPluginsObjName][name];
      delete packageJSON[packageJSONPluginsObjName][name];
      packageChanges = true;
      configChanges = true;
      defaultLog.info(corePluginName, ` - UPGRADE PLUGIN [${ name }] - from package.json map`);
    }
  }
  // upgrade path

  if (Tools.isNullOrUndefined(appConfig.enabledPlugins[name])) {
    appConfig.enabledPlugins[name] = false;
    configChanges = true;
    defaultLog.info(corePluginName, ` - REFERENCE PLUGIN [${ name }] - set state false`);
  }
  if (Tools.isNullOrUndefined(appConfig.mappedPlugins[name])) {
    appConfig.mappedPlugins[name] = name;
    configChanges = true;
    defaultLog.info(corePluginName, ` - REFERENCE PLUGIN [${ name }] - set map '${ name }'`);
  }

  if (appConfig.enabledPlugins[name] !== true) {
    defaultLog.info(corePluginName, ` - IGNORE PLUGIN [${ name }] - defined in sec.config.json`);
    return;
  }

  if (appConfig.mappedPlugins[name] !== name) {
    defaultLog.info(corePluginName, ` - MAP PLUGIN [${ name }] - set map '${ appConfig.mappedPlugins[name] }'`);
    name = appConfig.mappedPlugins[name];
  }

  if (!Tools.isNullOrUndefined(LIBRARY_PLUGINS[name])) {
    throw new Error(`Cannot have 2 plugins with the same name!! [${ name }]`);
  }

  if (pluginInstallerFile !== null)
    loadPluginConfig(name, pluginInstallerFile);

  let importedPlugin = await import(path);
  defaultLog.info(corePluginName, ` - ${ name }: LOADING`);
  LIBRARY_PLUGINS[name] = new importedPlugin.Plugin();
  defaultLog.info(corePluginName, ` - ${ name }: LOADED`);
};
const loadCorePlugin = (name: string, path: string, pluginInstallerFile: string | null) => {
  // upgrade path
  if (!Tools.isNullOrUndefined(packageJSON[packageJSONPluginsObjName])) {
    if (!Tools.isNullOrUndefined(packageJSON[packageJSONPluginsObjName][name])) {
      appConfig.enabledPlugins[name] = packageJSON[packageJSONPluginsObjName][name];
      delete packageJSON[packageJSONPluginsObjName][name];
      packageChanges = true;
      configChanges = true;
      defaultLog.info(corePluginName, ` - UPGRADE CORE-PLUGIN [${ name }] - from package.json state`);
    }
  }
  // upgrade path

  if (Tools.isNullOrUndefined(appConfig.enabledPlugins[name])) {
    appConfig.enabledPlugins[name] = false;
    configChanges = true;
  }
  if (appConfig.enabledPlugins[name] !== true) {
    defaultLog.info(corePluginName, ` - IGNORE PLUGIN [${ name }] - defined in sec.config.json`);
    return;
  }

  if (name.indexOf('log-') === 0) {
    if (pluginInstallerFile !== null)
      loadPluginConfig(name, pluginInstallerFile);
    let importedPlugin = require(path);
    defaultLog.info(corePluginName, ` - ${ name }: LOADED AS DEFAULT LOGGER`);
    logger = new importedPlugin.Logger();
    loggerName = name;
    return;
  }
  if (name.indexOf('events-') === 0) {
    if (pluginInstallerFile !== null)
      loadPluginConfig(name, pluginInstallerFile);
    let importedPlugin = require(path);
    defaultLog.info(corePluginName, ` - ${ name }: LOADED AS EVENTS HANDLER`);
    events = new importedPlugin.Events();
    eventsName = name;
    return;
  }

  defaultLog.warn(corePluginName, `Plugin (${ name }) was ignored as it's not a valid core plugin... contact support@bettercorp.co.za.`);
};

const loadPlugins = (path: string, pluginKey?: string): void => {
  if (_runningInPluginDebug && Tools.isNullOrUndefined(pluginKey)) {
    pluginKey = 'plugin-';
  }
  defaultLog.info(corePluginName, `Loading plugins in: ${ path } (${ pluginKey })`);
  for (let dirFileWhat of FS.readdirSync(path)) {
    defaultLog.info(corePluginName, `I think i found a plugin: ${ path } (${ dirFileWhat })`);
    if (FS.statSync(PATH.join(path, dirFileWhat)).isDirectory()) {
      if (dirFileWhat.indexOf('-') === 0) {
        defaultLog.info(corePluginName, ` - IGNORE [${ dirFileWhat }] No plugin reference type`);
        continue;
      }
      let pluginFile = PATH.join(path, dirFileWhat, 'plugin.ts');
      if (!FS.existsSync(pluginFile))
        pluginFile = PATH.join(path, dirFileWhat, 'plugin.js');
      if (!FS.existsSync(pluginFile)) {
        defaultLog.info(corePluginName, ` - IGNORE [${ dirFileWhat }] Not a valid plugin`);
        continue;
      }

      let pluginInstallerFile: string | null = PATH.join(path, dirFileWhat, 'sec.config.ts');
      if (!FS.existsSync(pluginInstallerFile))
        pluginInstallerFile = PATH.join(path, dirFileWhat, 'sec.config.js');
      if (!FS.existsSync(pluginInstallerFile))
        pluginInstallerFile = null;

      let foundCorePlugin = false;
      for (let cPlugin of CORE_PLUGINS) {
        if (dirFileWhat.indexOf(cPlugin) === 0) {
          foundCorePlugin = true;
          break;
        }
      }
      if (foundCorePlugin) {
        defaultLog.info(corePluginName, `Core plugin: ${ path } (${ dirFileWhat })`);
        loadCorePlugin(dirFileWhat, pluginFile, pluginInstallerFile);
        defaultLog.info(corePluginName, `Core plugin: ${ path } (${ dirFileWhat }) - LOADED`);
      } else {
        defaultLog.info(corePluginName, `Plugin: ${ path } (${ dirFileWhat })`);
        loadPlugin(`${ pluginKey || '' }${ dirFileWhat }`, pluginFile, pluginInstallerFile);
        defaultLog.info(corePluginName, `Plugin: ${ path } (${ dirFileWhat }) - LOADED`);
      }
    }
  }
};

const CORE_PLUGINS = ['log-', 'events-'];

export default class ServiceBase {
  init(): void {
    const npmPluginsDir = PATH.join(CWD, './node_modules/@bettercorp');
    defaultLog.info(corePluginName, `Load NPM plugins in: ${ npmPluginsDir }`);
    for (let dirFileWhat of FS.readdirSync(npmPluginsDir)) {
      defaultLog.info(corePluginName, ` - CHECK [${ dirFileWhat }] ${ PATH.join(npmPluginsDir, dirFileWhat) }`);
      if (FS.statSync(PATH.join(npmPluginsDir, dirFileWhat)).isDirectory()) {
        if (dirFileWhat.indexOf('service-base') != 0) {
          defaultLog.info(corePluginName, ` - IGNORE [${ dirFileWhat }] Not a service base package`);
          continue;
        }
        const innerPluginLib = PATH.join(npmPluginsDir, dirFileWhat, './lib');
        if (!FS.existsSync(innerPluginLib) || !FS.statSync(innerPluginLib).isDirectory()) {
          defaultLog.info(corePluginName, ` - IGNORE [${ dirFileWhat }] No lib dir in package`);
          continue;
        }
        const innerPluginLibPlugin = PATH.join(innerPluginLib, './plugins');
        if (!FS.existsSync(innerPluginLibPlugin)) {
          let pluginFile = PATH.join(innerPluginLib, 'plugin.ts');
          if (!FS.existsSync(pluginFile))
            pluginFile = PATH.join(innerPluginLib, 'plugin.js');
          if (!FS.existsSync(pluginFile)) {
            defaultLog.info(corePluginName, ` - IGNORE [${ dirFileWhat }] No plugin file available`);
            continue;
          }

          let pluginInstallerFile: string | null = PATH.join(innerPluginLib, dirFileWhat, 'sec.config.ts');
          if (!FS.existsSync(pluginInstallerFile))
            pluginInstallerFile = PATH.join(innerPluginLib, dirFileWhat, 'sec.config.js');
          if (!FS.existsSync(pluginInstallerFile))
            pluginInstallerFile = null;

          defaultLog.info(corePluginName, `Load NPM plugin in: ${ innerPluginLib }`);
          loadPlugin(dirFileWhat.replace('service-base-', ''), pluginFile, pluginInstallerFile);
          continue;
        }
        if (!FS.statSync(innerPluginLibPlugin).isDirectory()) {
          defaultLog.info(corePluginName, ` - IGNORE [${ dirFileWhat }] No inner plugins dir`);
          continue;
        }

        loadPlugins(innerPluginLibPlugin, 'plugin-');
      }
    }

    defaultLog.info(corePluginName, `Get app plugins in: ${ pluginsDir }`);
    loadPlugins(pluginsDir);

    if (canWriteChanges) {
      if (!Tools.isNullOrUndefined(packageJSON[packageJSONPluginsObjName])) {
        delete packageJSON[packageJSONPluginsObjName];
        packageChanges = true;
      }

      if (packageChanges) {
        defaultLog.error('PACKAGE.JSON AUTOMATICALLY UPDATED.');
        FS.writeFileSync(PACKAGE_JSON, JSON.stringify(packageJSON));
      }
      updateAppConfig();
    } else {
      updateAppConfig = () => { };
      defaultLog.info('SYSTEM IN LIVE MODE : WE WONT UPDATE FILES');
    }
  }

  async run(): Promise<void> {
    defaultLog.info(corePluginName, 'Setup plugins');
    await SETUP_PLUGINS();

    defaultLog.info(corePluginName, 'App Ready');
  }
}