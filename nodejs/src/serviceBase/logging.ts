import {
  DEBUG_MODE,
  IPluginLogger,
  LogMeta,
  LoggingEventTypes,
  LoggingEventTypesBase,
  LoggingEventTypesExlReportStat,
  BSBLogging,
  PluginLogger,
  FilterOnType,
  IPluginDefinition,
  LoggingFilter,
  LoggingFilterDetailed,
  SBPlugins,
  SBConfig,
  SmartFunctionCallAsync,
  SmartFunctionCallSync,
  LoadedPlugin,
} from "../";
import { Plugin as DefaultLogger } from "../plugins/logging-default/plugin";
import { EventEmitter } from "stream";
import { Tools } from "@bettercorp/tools/lib/Tools";

export class SBLogging {
  private loggers: Array<{
    plugin: BSBLogging<any>;
    on?: LoggingFilter;
    onTypeof: FilterOnType;
  }> = [];
  public logBus: EventEmitter = new EventEmitter();
  private mode: DEBUG_MODE = "development";
  private appId: string;
  private cwd: string;
  private sbPlugins: SBPlugins;
  private log: IPluginLogger;

  constructor(
    appId: string,
    mode: DEBUG_MODE,
    cwd: string,
    sbPlugins: SBPlugins
  ) {
    this.appId = appId;
    this.mode = mode;
    this.cwd = cwd;
    this.sbPlugins = sbPlugins;
    this.loggers.push({
      plugin: new DefaultLogger({
        appId: this.appId,
        mode: this.mode,
        pluginName: "logging-default",
        cwd: this.cwd,
        pluginCwd: this.cwd,
        config: null,
      }),
      onTypeof: "all",
    });
    const loggingPluginName = "core-logging";
    this.log = new PluginLogger(this.mode, loggingPluginName, this);

    if (this.mode !== "production") {
      this.logBus.on("debug", (plugin, message, meta) => {
        this.triggerLogEvent("debug", plugin, message, meta);
      });
    }
    this.logBus.on("reportStat", (plugin, key, value) => {
      this.triggerLogEvent("reportStat", plugin, key, value);
    });
    this.logBus.on("reportTextStat", (plugin, message, meta) => {
      this.triggerLogEvent("reportTextStat", plugin, message, meta);
    });
    this.logBus.on("info", (plugin, message, meta) => {
      this.triggerLogEvent("info", plugin, message, meta);
    });
    this.logBus.on("warn", (plugin, message, meta) => {
      this.triggerLogEvent("warn", plugin, message, meta);
    });
    this.logBus.on(
      "error",
      (
        plugin,
        message: string,
        errorOrMeta: Error | LogMeta<string>,
        meta?: LogMeta<string>
      ) => {
        this.triggerLogEvent("error", plugin, message, errorOrMeta, meta);
      }
    );
  }

  public dispose() {
    for (
      let loggerIndex = 0;
      loggerIndex < this.loggers.length;
      loggerIndex++
    ) {
      if (this.loggers[loggerIndex].plugin.dispose !== undefined)
        SmartFunctionCallSync(
          this.loggers[loggerIndex].plugin,
          this.loggers[loggerIndex].plugin.dispose
        );
    }
    this.logBus.removeAllListeners();
  }

  private getPluginsMatchingLogEvent(log: LoggingEventTypes, plugin: string) {
    return this.loggers.filter((logger) => {
      if (Tools.isNullOrUndefined(logger.plugin)) return false;
      if (Tools.isNullOrUndefined(logger.on)) return true;
      switch (logger.onTypeof) {
        case "all":
          return true;
        case "events":
          return (logger.on as Array<LoggingEventTypes>).includes(log);
        case "eventsState":
          if (
            Tools.isNullOrUndefined(
              (logger.on as Record<LoggingEventTypes, boolean>)[log]
            )
          )
            return false;
          return (logger.on as Record<LoggingEventTypes, boolean>)[log];
        case "eventsPlugins":
          if (
            Tools.isNullOrUndefined(
              (logger.on as Record<LoggingEventTypes, Array<string>>)[log]
            )
          )
            return false;
          return (logger.on as Record<LoggingEventTypes, Array<string>>)[
            log
          ].includes(plugin);
        case "eventsDetailed":
          if (
            Tools.isNullOrUndefined((logger.on as LoggingFilterDetailed)[log])
          )
            return false;
          if ((logger.on as LoggingFilterDetailed)[log].enabled !== true)
            return false;
          return (logger.on as LoggingFilterDetailed)[log].plugins.includes(
            plugin
          );
      }
    });
  }

  private async triggerLogEventReportStat(
    loggerPlugin: BSBLogging<any>,
    plugin: string,
    key: string,
    value: number
  ): Promise<void> {
    await SmartFunctionCallAsync(
      loggerPlugin,
      loggerPlugin.reportStat,
      plugin,
      key,
      value
    );
  }

  private async triggerLogEvent(
    logAs: "reportStat",
    plugin: string,
    key: string,
    value: number
  ): Promise<void>;
  private async triggerLogEvent<T extends string>(
    logAs: LoggingEventTypesExlReportStat,
    plugin: string,
    message: T,
    metaOrError: LogMeta<T> | Error,
    meta?: LogMeta<T>
  ): Promise<void>;
  private async triggerLogEvent<T extends string>(
    logAs: LoggingEventTypes,
    plugin: string,
    messageOrKey: T | string,
    metaOrValueOrError: LogMeta<T> | number | Error,
    meta?: LogMeta<T>
  ): Promise<void> {
    for (const logger of this.getPluginsMatchingLogEvent(logAs, plugin)) {
      if (logAs === "reportStat") {
        await this.triggerLogEventReportStat(
          logger.plugin,
          plugin,
          messageOrKey as string,
          metaOrValueOrError as number
        );
        continue;
      }

      let method;
      switch (logAs) {
        case "reportTextStat":
          method = logger.plugin.reportTextStat;
          break;
        case "debug":
          method = logger.plugin.debug;
          break;
        case "info":
          method = logger.plugin.info;
          break;
        case "warn":
          method = logger.plugin.warn;
          break;
        case "error":
          return await SmartFunctionCallAsync(
            logger.plugin,
            logger.plugin.error,
            plugin,
            messageOrKey as string,
            metaOrValueOrError,
            meta
          );
          break;
      }

      if (method) {
        await SmartFunctionCallAsync(
          logger.plugin,
          method,
          plugin,
          messageOrKey as string,
          metaOrValueOrError as LogMeta<T>
        );
      }
    }
  }
  public async init(sbConfig: SBConfig) {
    this.log.debug("INIT SBLogging");
    const plugins = await sbConfig.getLoggingPlugins();
    for (const plugin of Object.keys(plugins)) {
      await this.addLogger(
        sbConfig,
        {
          name: plugin,
          package: plugins[plugin].package,
          plugin: plugins[plugin].plugin,
          version: "",
        },
        plugins[plugin].filter
      );
    }
  }

  public async run() {
    if (this.loggers.length === 1) return;
    // we want to see if any plugins (ignore logging-default) are listening to all logs - it so, there is no reason to keep the logging-default plugin, so we can dispose and remove it
    const pluginsListeningToAll = this.loggers.filter((logger) => {
      if (Tools.isNullOrUndefined(logger.on)) return false;
      if (logger.onTypeof === "all") return true;
      return false;
    });
    if (pluginsListeningToAll.length > 0) {
      const loggerIndex = this.loggers.findIndex((logger) => {
        return logger.plugin.pluginName === "logging-default";
      });
      if (loggerIndex !== -1) {
        if (this.loggers[loggerIndex].plugin.dispose !== undefined)
          SmartFunctionCallSync(
            this.loggers[loggerIndex].plugin,
            this.loggers[loggerIndex].plugin.dispose
          );
        this.loggers.splice(loggerIndex, 1);
      }
    }
  }

  public async addPlugin(
    plugin: IPluginDefinition,
    reference: LoadedPlugin<"logging">,
    config: any,
    filter?: LoggingFilter
  ) {
    this.log.debug(`Construct logging plugin: {name}`, {
      name: plugin.name,
    });

    const loggerPlugin = new reference.plugin({
      appId: this.appId,
      mode: this.mode,
      pluginName: reference.name,
      cwd: this.cwd,
      pluginCwd: reference.pluginCWD,
      config: config,
    });
    this.log.info("Adding {pluginName} as logger with filter: ", {
      pluginName: plugin.name,
      //filters: filter
    });
    let logAsType: FilterOnType = "all";

    if (filter) {
      if (Array.isArray(filter)) {
        logAsType = "events";
      } else if (typeof filter === "object") {
        const methods = Object.keys(LoggingEventTypesBase);
        for (const method of methods) {
          if (
            (filter as unknown as Record<string, any>)[method] !== undefined
          ) {
            const methodValue = filter[method as keyof typeof filter];
            if (typeof methodValue === "boolean") {
              logAsType = "eventsState";
            } else if (Array.isArray(methodValue)) {
              logAsType = "eventsPlugins";
            } else if (typeof methodValue === "object") {
              logAsType = "eventsDetailed";
            }
          }
        }
      }
    }
    this.loggers.push({
      plugin: loggerPlugin,
      on: filter,
      onTypeof: logAsType,
    });

    this.log.info("Ready {pluginName} ({mappedName})", {
      pluginName: plugin.plugin,
      mappedName: plugin.name,
    });

    await SmartFunctionCallAsync(loggerPlugin, loggerPlugin.init);

    return loggerPlugin;
  }

  private async addLogger(
    sbConfig: SBConfig,
    plugin: IPluginDefinition,
    filter?: LoggingFilter
  ) {
    this.log.debug("Add logger {name} from ({package}){file}", {
      package: plugin.package ?? "-",
      name: plugin.name,
      file: plugin.plugin,
    });
    if (plugin.name === "logging-default") return;
    this.log.debug(`Import logging plugin: {name} from ({package}){file}`, {
      package: plugin.package ?? "-",
      name: plugin.name,
      file: plugin.plugin,
    });

    const newPlugin = await this.sbPlugins.loadPlugin<"logging">(
      this.log,
      plugin.package ?? null,
      plugin.plugin,
      plugin.name
    );
    if (newPlugin === null) {
      this.log.error(
        "Failed to import logging plugin: {name} from ({package}){file}",
        {
          package: plugin.package ?? "-",
          name: plugin.name,
          file: plugin.plugin,
        }
      );
      return;
    }

    this.log.debug(`Get plugin config: {name}`, {
      name: plugin.name,
    });

    let pluginConfig =
      (await sbConfig.getPluginConfig("logging", plugin.name)) ?? null;

    if (
      this.mode !== "production" &&
      !Tools.isNullOrUndefined(newPlugin) &&
      !Tools.isNullOrUndefined(newPlugin.serviceConfig) &&
      Tools.isObject(newPlugin.serviceConfig) &&
      !Tools.isNullOrUndefined(newPlugin.serviceConfig.validationSchema)
    ) {
      this.log.debug("Validate plugin config: {name}", { name: plugin.name });
      pluginConfig =
        newPlugin.serviceConfig.validationSchema.parse(pluginConfig);
    }

    await this.addPlugin(plugin, newPlugin, pluginConfig, filter);
  }
}
