/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2016 - 2025 BetterCorp (PTY) Ltd  
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

import { BSBLogging, PluginLogging, SmartFunctionCallAsync, SmartFunctionCallSync, Tools } from "../base";
import {
  DEBUG_MODE,
  FilterOnType, IPluginDefinition,
  IPluginLogging, LoadedPlugin,
  LoggingEventTypes, LoggingEventTypesBase,
  LoggingFilter,
  LoggingFilterDetailed,
  LogMeta,
} from "../interfaces";
import { EventEmitter } from "node:events";
import { SBConfig } from "./config";
import { SBPlugins } from "./plugins";
import { createFakeDTrace, DTrace } from "../interfaces/metrics";

/**
 * @hidden
 */
function internalTrace(span: string): DTrace {
  return createFakeDTrace("serviceBase/SBLogging", span);
}

/**
 * BSB Logging Controller
 * 
 * This class is responsible for managing the logging in the BSB framework.
 * If you have a specific way of managing logging, you can extend this class and then use your own class when creating the ServiceBase instance.
 * 
 * @group Logging
 * @category Core
 */
export class SBLogging {
  /**
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/SBLogging.html | API: SBLogging}
   */
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
  private log: IPluginLogging;

  constructor(
    appId: string,
    mode: DEBUG_MODE,
    cwd: string,
    sbPlugins: SBPlugins,
  ) {
    this.appId = appId;
    this.mode = mode;
    this.cwd = cwd;
    this.sbPlugins = sbPlugins;
    const loggingPluginName = "core-logging";
    this.log = new PluginLogging(this.mode, loggingPluginName, this);

    if (this.mode !== "production") {
      this.logBus.on("debug", (plugin, trace, message, meta) => {
        this.triggerLogEvent("debug", plugin, trace, message, meta);
      });
    }
    this.logBus.on("info", (plugin, trace, message, meta) => {
      this.triggerLogEvent("info", plugin, trace, message, meta);
    });
    this.logBus.on("warn", (plugin, trace, message, meta) => {
      this.triggerLogEvent("warn", plugin, trace, message, meta);
    });
    this.logBus.on(
      "error",
      (
        plugin,
        trace,
        message: string,
        meta?: LogMeta<string>,
      ) => {
        this.triggerLogEvent("error", plugin, trace, message, meta);
      },
    );
  }

  public dispose() {
    for (
      let loggerIndex = 0;
      loggerIndex < this.loggers.length;
      loggerIndex++
    ) {
      if (this.loggers[loggerIndex].plugin.dispose !== undefined) {
        SmartFunctionCallSync(
          this.loggers[loggerIndex].plugin,
          this.loggers[loggerIndex].plugin.dispose,
        );
      }
    }
    this.logBus.removeAllListeners();
  }

  private getPluginsMatchingLogEvent(log: LoggingEventTypes, plugin: string) {
    return this.loggers.filter((logger) => {
      if (Tools.isNullOrUndefined(logger.plugin)) {
        return false;
      }
      if (Tools.isNullOrUndefined(logger.on)) {
        return true;
      }
      switch (logger.onTypeof) {
        case "all":
          return true;
        case "events":
          return (
            logger.on as Array<LoggingEventTypes>
          ).includes(log);
        case "eventsState":
          if (
            Tools.isNullOrUndefined(
              (
                logger.on as Record<LoggingEventTypes, boolean>
              )[log],
            )
          ) {
            return false;
          }
          return (
            logger.on as Record<LoggingEventTypes, boolean>
          )[log];
        case "eventsPlugins":
          if (
            Tools.isNullOrUndefined(
              (
                logger.on as Record<LoggingEventTypes, Array<string>>
              )[log],
            )
          ) {
            return false;
          }
          return (
            logger.on as Record<LoggingEventTypes, Array<string>>
          )[
            log
          ].includes(plugin);
        case "eventsDetailed":
          if (
            Tools.isNullOrUndefined((
              logger.on as LoggingFilterDetailed
            )[log])
          ) {
            return false;
          }
          if ((
            logger.on as LoggingFilterDetailed
          )[log].enabled !== true) {
            return false;
          }
          return (
            logger.on as LoggingFilterDetailed
          )[log].plugins.includes(
            plugin,
          );
      }
    });
  }

  private async triggerLogEvent<T extends string>(
    logAs: LoggingEventTypes,
    plugin: string,
    trace: DTrace,
    messageOrKey: T | string,
    metaOrValue?: LogMeta<T> | number,
  ): Promise<void> {
    for (const logger of this.getPluginsMatchingLogEvent(logAs, plugin)) {
      let method;
      switch (logAs) {
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
          await SmartFunctionCallAsync(
            logger.plugin,
            logger.plugin.error,
            plugin,
            trace,
            messageOrKey as string,
            metaOrValue,
          );
          return;
      }

      if (method) {
        await SmartFunctionCallAsync(
          logger.plugin,
          method,
          plugin,
          trace,
          messageOrKey as string,
          metaOrValue as LogMeta<T>,
        );
      }
    }
  }

  public async init(sbConfig: SBConfig) {
    const dTrace = internalTrace("init");
    this.log.debug(dTrace, "INIT SBLogging");
    const plugins = await sbConfig.getLoggingPlugins(dTrace);
    for (const plugin of Object.keys(plugins)) {
      await this.addLogger(
        sbConfig,
        {
          name: plugin,
          package: plugins[plugin].package,
          plugin: plugins[plugin].plugin,
          version: "",
        },
        plugins[plugin].filter,
      );
    }
  }

  public async run() {
    if (this.loggers.length === 0) {
      console.warn('BSB Started with no logging plugins... no issues, but you wont see any logs');
    }
  }

  public async addPlugin(
    plugin: IPluginDefinition,
    reference: LoadedPlugin<"logging">,
    config: any,
    filter?: LoggingFilter,
  ) {
    const dTrace = internalTrace("addPlugin");
    this.log.debug(dTrace, `Construct logging plugin: {name}`, {
      name: plugin.name,
    });

    const loggerPlugin = new reference.plugin({
      appId: this.appId,
      mode: this.mode,
      pluginName: reference.name,
      cwd: this.cwd,
      packageCwd: reference.packageCwd,
      pluginCwd: reference.pluginCwd,
      config: config,
      pluginVersion: reference.version,
    });
    this.log.info(dTrace, "Adding {pluginName} as logger with filter: ", {
      pluginName: plugin.name,
      //filters: filter
    });
    let logAsType: FilterOnType = "all";

    if (filter) {
      if (Array.isArray(filter)) {
        logAsType = "events";
      }
      else if (typeof filter === "object") {
        const methods = Object.keys(LoggingEventTypesBase);
        for (const method of methods) {
          if (
            (
              filter as unknown as Record<string, any>
            )[method] !== undefined
          ) {
            const methodValue = filter[method as keyof typeof filter];
            if (typeof methodValue === "boolean") {
              logAsType = "eventsState";
            }
            else if (Array.isArray(methodValue)) {
              logAsType = "eventsPlugins";
            }
            else if (typeof methodValue === "object") {
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

    this.log.info(dTrace, "Ready {pluginName} ({mappedName})", {
      pluginName: plugin.plugin,
      mappedName: plugin.name,
    });

    await SmartFunctionCallAsync(loggerPlugin, loggerPlugin.init, dTrace);

    return loggerPlugin;
  }

  private async addLogger(
    sbConfig: SBConfig,
    plugin: IPluginDefinition,
    filter?: LoggingFilter,
  ) {
    const dTrace = internalTrace("addLogger");
    this.log.debug(dTrace, "Add logger {name} from ({package}){file}", {
      package: plugin.package ?? "-",
      name: plugin.name,
      file: plugin.plugin,
    });
    this.log.debug(dTrace, `Import logging plugin: {name} from ({package}){file}`, {
      package: plugin.package ?? "-",
      name: plugin.name,
      file: plugin.plugin,
    });

    const newPlugin = await this.sbPlugins.loadPlugin<"logging">(
      this.log,
      plugin.package ?? null,
      plugin.plugin,
      plugin.name,
    );
    if (newPlugin === null || !newPlugin.success) {
      this.log.error(
        dTrace,
        "Failed to import logging plugin: {name} from ({package}){file}",
        {
          package: plugin.package ?? "-",
          name: plugin.name,
          file: plugin.plugin,
        },
      );
      return;
    }

    this.log.debug(dTrace, `Get plugin config: {name}`, {
      name: plugin.name,
    });

    let pluginConfig =
      (
        await sbConfig.getPluginConfig(dTrace, "logging", plugin.name)
      ) ?? null;

    if (
      !Tools.isNullOrUndefined(newPlugin.data.serviceConfig) &&
      Tools.isObject(newPlugin.data.serviceConfig) &&
      !Tools.isNullOrUndefined(newPlugin.data.serviceConfig.validationSchema)
    ) {
      this.log.debug(dTrace, "Validate plugin config: {name}", { name: plugin.name });
      pluginConfig =
        newPlugin.data.serviceConfig.validationSchema.parse(pluginConfig ?? undefined);
    }

    await this.addPlugin(plugin, newPlugin.data, pluginConfig, filter);
  }
}
