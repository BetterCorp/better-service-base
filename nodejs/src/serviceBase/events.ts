import { DEBUG_MODE, IPluginLogger } from "../interfaces/logging";
import { PluginLogger } from "../base/PluginLogger";
import { Readable } from "stream";
import { Plugin as DefaultEvents } from "../plugins/events-default/plugin";
import {
  EventsFilter,
  EventsFilterDetailed,
  FilterOnType,
  IPluginDefinition,
} from "../interfaces/plugins";
import { SBPlugins } from "./plugins";
import { SBConfig } from "./config";
import { Tools } from "@bettercorp/tools";
import {
  SmartFunctionCallAsync,
  SmartFunctionCallSync,
} from "../base/functions";
import { BSBEvents } from "../base/events";
import { SBLogging } from "./logging";
import { EventsEventTypes, EventsEventTypesBase } from "../interfaces/events";
import { BSBError } from "../base/errorMessages";
import { NS_PER_SEC, MS_PER_NS } from "./serviceBase";
import { BSBService } from "../base/service";
import { BSBServiceClient } from "../base/serviceClient";

export class SBEvents {
  private events: Array<{
    name: string;
    plugin: BSBEvents<any>;
    on?: EventsFilter;
    onTypeof: FilterOnType;
  }> = [];
  private mode: DEBUG_MODE = "development";
  private appId: string;
  private cwd: string;
  private sbPlugins: SBPlugins;
  private log: IPluginLogger;

  constructor(
    appId: string,
    mode: DEBUG_MODE,
    cwd: string,
    sbPlugins: SBPlugins,
    sbLogging: SBLogging
  ) {
    this.appId = appId;
    this.mode = mode;
    this.cwd = cwd;
    this.sbPlugins = sbPlugins;
    const eventsPluginName = "core-events";
    this.log = new PluginLogger(this.mode, eventsPluginName, sbLogging);
  }

  public dispose() {
    for (let eventsIndex = 0; eventsIndex < this.events.length; eventsIndex++) {
      if (this.events[eventsIndex].plugin.dispose !== undefined)
        SmartFunctionCallSync(
          this.events[eventsIndex].plugin,
          this.events[eventsIndex].plugin.dispose
        );
    }
  }

  private getPluginsMatchingTriggerEvent(
    event: EventsEventTypes,
    plugin: string
  ) {
    return this.events.find((eventPlugin) => {
      if (Tools.isNullOrUndefined(eventPlugin.plugin)) return false;
      if (Tools.isNullOrUndefined(eventPlugin.on)) return true;
      switch (eventPlugin.onTypeof) {
        case "all":
          return true;
        case "events":
          return (eventPlugin.on as Array<EventsEventTypes>).includes(event);
        case "eventsState":
          if (
            Tools.isNullOrUndefined(
              (eventPlugin.on as Record<EventsEventTypes, boolean>)[event]
            )
          )
            return false;
          return (eventPlugin.on as Record<EventsEventTypes, boolean>)[event];
        case "eventsPlugins":
          if (
            Tools.isNullOrUndefined(
              (eventPlugin.on as Record<EventsEventTypes, Array<string>>)[event]
            )
          )
            return false;
          return (eventPlugin.on as Record<EventsEventTypes, Array<string>>)[
            event
          ].includes(plugin);
        case "eventsDetailed":
          if (
            Tools.isNullOrUndefined(
              (eventPlugin.on as EventsFilterDetailed)[event]
            )
          )
            return false;
          if ((eventPlugin.on as EventsFilterDetailed)[event].enabled !== true)
            return false;
          return (eventPlugin.on as EventsFilterDetailed)[
            event
          ].plugins.includes(plugin);
      }
    });
  }

  private getPluginForEvent(
    eventAs: EventsEventTypes,
    plugin: string,
    event: string
  ): {
    pluginName: string;
    plugin: BSBEvents<any>;
  } {
    let matchingEvent = this.getPluginsMatchingTriggerEvent(eventAs, plugin);
    if (matchingEvent === undefined)
      throw new BSBError(
        "SBEvents-triggerEvent",
        "No plugins found to match event: plugin: {plugin} - eventAs: {eventAs} - event: {event}",
        { eventAs, plugin, event }
      );
    return {
      plugin: matchingEvent.plugin,
      pluginName: matchingEvent.name,
    };
  }
  public async init(sbConfig: SBConfig, sbLogging: SBLogging) {
    this.log.debug("INIT SBEvents");
    let plugins = await sbConfig.getEventsPlugins();
    for (let plugin of Object.keys(plugins)) {
      await this.addEvents(
        sbConfig,
        sbLogging,
        {
          name: plugin,
          package: plugins[plugin].package,
          plugin: plugins[plugin].plugin,
          version: "",
        },
        plugins[plugin].filter
      );
    }
    this.log.info('Adding "events-default" as events');
    this.events.push({
      name: "events-default",
      plugin: new DefaultEvents({
        appId: this.appId,
        mode: this.mode,
        pluginName: "events-default",
        cwd: this.cwd,
        pluginCwd: this.cwd,
        config: {},
        sbLogging,
      }),
      on: undefined,
      onTypeof: "all",
    });
  }

  private async addEvents(
    sbConfig: SBConfig,
    sbLogging: SBLogging,
    plugin: IPluginDefinition,
    filter?: EventsFilter
  ) {
    this.log.debug("Add events {name} from ({package}){file}", {
      package: plugin.package ?? "this project",
      name: plugin.name,
      file: plugin.plugin,
    });
    if (plugin.name === "events-default") return;
    this.log.debug(`Import events plugin: {name} from ({package}){file}`, {
      package: plugin.package ?? "this project",
      name: plugin.name,
      file: plugin.plugin,
    });

    const newPlugin = await this.sbPlugins.loadPlugin<"events">(
      this.log,
      plugin.package ?? null,
      plugin.plugin,
      plugin.name
    );
    if (newPlugin === null) {
      this.log.error(
        "Failed to import events plugin: {name} from ({package}){file}",
        {
          package: plugin.package ?? "this project",
          name: plugin.name,
          file: plugin.plugin,
        }
      );
      return;
    }

    this.log.debug(`Get plugin config: {name}`, {
      name: plugin.name,
    });

    const pluginConfig = await sbConfig.getPluginConfig("events", plugin.name);

    this.log.debug(`Construct events plugin: {name}`, {
      name: plugin.name,
    });

    let eventsPlugin = new newPlugin.plugin({
      appId: this.appId,
      mode: this.mode,
      pluginName: newPlugin.name,
      cwd: this.cwd,
      pluginCwd: newPlugin.pluginCWD,
      config: pluginConfig,
      sbLogging,
    });
    this.log.info("Adding {pluginName} as events with filter: ", {
      pluginName: plugin.name,
      //filters: filter
    });
    let eventAsType: FilterOnType = "all";

    if (filter) {
      if (Array.isArray(filter)) {
        eventAsType = "events";
      } else if (typeof filter === "object") {
        const methods = Object.keys(EventsEventTypesBase);
        for (let method of methods) {
          if (filter.hasOwnProperty(method)) {
            const methodValue = filter[method as keyof typeof filter];
            if (typeof methodValue === "boolean") {
              eventAsType = "eventsState";
            } else if (Array.isArray(methodValue)) {
              eventAsType = "eventsPlugins";
            } else if (typeof methodValue === "object") {
              eventAsType = "eventsDetailed";
            }
          }
        }
      }
    }
    this.events.unshift({
      plugin: eventsPlugin,
      on: filter,
      onTypeof: eventAsType,
      name: plugin.name,
    });

    this.log.info("Ready {pluginName} ({mappedName})", {
      pluginName: plugin.plugin,
      mappedName: plugin.name,
    });

    await SmartFunctionCallAsync(eventsPlugin, eventsPlugin.init);
  }

  private async handleOnBroadcast(
    eventsPluginName: string,
    pluginName: string,
    event: string,
    context: BSBService | BSBServiceClient<any>,
    listener: { (...args: Array<any>): Promise<void> | void },
    iargs: Array<any>
  ) {
    const start = process.hrtime();
    try {
      await SmartFunctionCallAsync(context, listener, ...iargs);
      let diff = process.hrtime(start);
      this.log.reportStat(
        `on-broadcast-${eventsPluginName}-${pluginName}-${event}`,
        (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
      );
    } catch (exc: any) {
      this.log.reportStat(
        `on-broadcast-${eventsPluginName}-${pluginName}-${event}`,
        -1
      );
      this.log.error("handleOnBroadcast error occured: ${error}", {
        error: exc.message ?? exc,
      });
      throw exc;
    }
  }
  public async onBroadcast(
    context: BSBService | BSBServiceClient<any>,
    pluginName: string,
    event: string,
    listener: { (...args: Array<any>): Promise<void> | void }
  ): Promise<void> {
    const self = this;
    const plugin = await this.getPluginForEvent(
      "onBroadcast",
      pluginName,
      event
    );
    plugin.plugin.onBroadcast(pluginName, event, async (iargs: Array<any>) =>
      self.handleOnBroadcast.call(
        self,
        plugin.pluginName,
        pluginName,
        event,
        context,
        listener,
        iargs
      )
    );
  }

  public async emitBroadcast(
    pluginName: string,
    event: string,
    ...args: Array<any>
  ): Promise<void> {
    const plugin = await this.getPluginForEvent(
      "emitBroadcast",
      pluginName,
      event
    );
    this.log.reportStat(
      `emit-broadcast-${plugin.pluginName}-${pluginName}-${event}`,
      1
    );
    await SmartFunctionCallAsync(
      plugin.plugin,
      plugin.plugin.emitBroadcast,
      pluginName,
      event,
      args
    );
  }

  private async handleOnEvent(
    eventsPluginName: string,
    pluginName: string,
    event: string,
    context: BSBService | BSBServiceClient<any>,
    listener: { (...args: Array<any>): Promise<void> | void },
    iargs: Array<any>
  ) {
    const start = process.hrtime();
    try {
      //console.log("CALL ON EVENT", context, listener, iargs);
      await SmartFunctionCallAsync(context, listener, ...iargs);
      let diff = process.hrtime(start);
      this.log.reportStat(
        `on-event-${eventsPluginName}-${pluginName}-${event}`,
        (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
      );
    } catch (exc: any) {
      this.log.reportStat(
        `on-event-${eventsPluginName}-${pluginName}-${event}`,
        -1
      );
      this.log.error("handleOnEvent error occured: ${error}", {
        error: exc.message ?? exc,
      });
      throw exc;
    }
  }
  public async onEvent(
    context: BSBService | BSBServiceClient<any>,
    pluginName: string,
    event: string,
    listener: { (...args: Array<any>): Promise<void> | void }
  ): Promise<void> {
    const self = this;
    const plugin = await this.getPluginForEvent("onEvent", pluginName, event);
    plugin.plugin.onEvent(pluginName, event, async (iargs: Array<any>) =>
      self.handleOnEvent.call(
        self,
        plugin.pluginName,
        pluginName,
        event,
        context,
        listener,
        iargs
      )
    );
  }
  public async onEventSpecific(
    serverId: string,
    context: BSBService | BSBServiceClient<any>,
    pluginName: string,
    event: string,
    listener: { (...args: Array<any>): Promise<void> | void }
  ): Promise<void> {
    const self = this;
    const plugin = await this.getPluginForEvent("onEvent", pluginName, event);
    plugin.plugin.onEvent(
      pluginName,
      event + "-" + serverId,
      async (iargs: Array<any>) =>
        self.handleOnEvent.call(
          self,
          plugin.pluginName,
          pluginName,
          event + "-" + serverId,
          context,
          listener,
          iargs
        )
    );
  }

  public async emitEvent(
    pluginName: string,
    event: string,
    ...args: Array<any>
  ): Promise<void> {
    const plugin = await this.getPluginForEvent("emitEvent", pluginName, event);
    this.log.reportStat(
      `emit-event-${plugin.pluginName}-${pluginName}-${event}`,
      1
    );
    await SmartFunctionCallAsync(
      plugin.plugin,
      plugin.plugin.emitEvent,
      pluginName,
      event,
      args
    );
  }
  public async emitEventSpecific(
    serverId: string,
    pluginName: string,
    event: string,
    ...args: Array<any>
  ): Promise<void> {
    const plugin = await this.getPluginForEvent("emitEvent", pluginName, event);
    this.log.reportStat(
      `emit-event-${plugin.pluginName}-${pluginName}-${event}-${serverId}`,
      1
    );
    await SmartFunctionCallAsync(
      plugin.plugin,
      plugin.plugin.emitEvent,
      pluginName,
      event + "-" + serverId,
      args
    );
  }

  private async handleOnReturnableEvent(
    eventsPluginName: string,
    pluginName: string,
    event: string,
    context: BSBService | BSBServiceClient<any>,
    listener: { (...args: Array<any>): Promise<any> | any },
    iargs: Array<any>
  ) {
    const start = process.hrtime();
    try {
      const resp = await SmartFunctionCallAsync(context, listener, ...iargs);
      let diff = process.hrtime(start);
      this.log.reportStat(
        `on-returnableevent-${eventsPluginName}-${pluginName}-${event}`,
        (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
      );
      return resp;
    } catch (exc: any) {
      this.log.reportStat(
        `on-returnableevent-${eventsPluginName}-${pluginName}-${event}`,
        -1
      );
      this.log.error("handleOnReturnableEvent error occured: ${error}", {
        error: exc.message ?? exc,
      });
      throw exc;
    }
  }
  public async onReturnableEvent(
    context: BSBService | BSBServiceClient<any>,
    pluginName: string,
    event: string,
    listener: { (...args: Array<any>): Promise<void> | void }
  ): Promise<void> {
    const self = this;
    const plugin = await this.getPluginForEvent(
      "onReturnableEvent",
      pluginName,
      event
    );
    plugin.plugin.onReturnableEvent(
      pluginName,
      event,
      async (iargs: Array<any>) =>
        self.handleOnReturnableEvent.call(
          self,
          plugin.pluginName,
          pluginName,
          event,
          context,
          listener,
          iargs
        )
    );
  }
  public async onReturnableEventSpecific(
    serverId: string,
    context: BSBService | BSBServiceClient<any>,
    pluginName: string,
    event: string,
    listener: { (...args: Array<any>): Promise<void> | void }
  ): Promise<void> {
    const self = this;
    const plugin = await this.getPluginForEvent(
      "onReturnableEvent",
      pluginName,
      event
    );
    plugin.plugin.onReturnableEvent(
      pluginName,
      event + "-" + serverId,
      async (iargs: Array<any>) =>
        self.handleOnReturnableEvent.call(
          self,
          plugin.pluginName,
          pluginName,
          event + "-" + serverId,
          context,
          listener,
          iargs
        )
    );
  }
  public async emitEventAndReturn(
    pluginName: string,
    event: string,
    timeoutSeconds: number,
    ...args: Array<any>
  ): Promise<any> {
    const start = process.hrtime();
    const plugin = await this.getPluginForEvent(
      "emitEventAndReturn",
      pluginName,
      event
    );
    try {
      const resp = await SmartFunctionCallAsync(
        plugin.plugin,
        plugin.plugin.emitEventAndReturn,
        pluginName,
        event,
        timeoutSeconds,
        args
      );
      let diff = process.hrtime(start);
      this.log.reportStat(
        `emit-eventandreturn-${plugin.pluginName}-${pluginName}-${event}`,
        (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
      );
      return resp;
    } catch (exc: any) {
      this.log.reportStat(
        `emit-eventandreturn-${plugin.pluginName}-${pluginName}-${event}`,
        -1
      );
      this.log.error("emitEventAndReturn error occured: ${error}", {
        error: exc.message ?? exc,
      });
      throw exc;
    }
  }
  public async emitEventAndReturnSpecific(
    serverId: string,
    pluginName: string,
    event: string,
    timeoutSeconds: number,
    ...args: Array<any>
  ): Promise<any> {
    const start = process.hrtime();
    const plugin = await this.getPluginForEvent(
      "emitEventAndReturn",
      pluginName,
      event
    );
    try {
      const resp = await SmartFunctionCallAsync(
        plugin.plugin,
        plugin.plugin.emitEventAndReturn,
        pluginName,
        event + "-" + serverId,
        timeoutSeconds,
        args
      );
      let diff = process.hrtime(start);
      this.log.reportStat(
        `emit-eventandreturn-${plugin.pluginName}-${pluginName}-${event}-${serverId}`,
        (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
      );
      return resp;
    } catch (exc: any) {
      this.log.reportStat(
        `emit-eventandreturn-${plugin.pluginName}-${pluginName}-${event}-${serverId}`,
        -1
      );
      this.log.error("emitEventAndReturnSpecific error occured: ${error}", {
        error: exc.message ?? exc,
      });
      throw exc;
    }
  }

  private async handleOnReceiveStream(
    eventsPluginName: string,
    pluginName: string,
    event: string,
    context: BSBService | BSBServiceClient<any>,
    listener: { (error: Error | null, stream: Readable): Promise<void> },
    error: Error | null,
    stream: Readable
  ) {
    const start = process.hrtime();
    try {
      const resp = await SmartFunctionCallAsync(
        context,
        listener,
        error,
        stream
      );
      let diff = process.hrtime(start);
      this.log.reportStat(
        `receivestream-${eventsPluginName}-${pluginName}-${event}`,
        (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
      );
      return resp;
    } catch (exc: any) {
      this.log.reportStat(
        `receivestream-${eventsPluginName}-${pluginName}-${event}`,
        -1
      );
      this.log.error("handleOnReceiveStream error occured: ${error}", {
        error: exc.message ?? exc,
      });
      throw exc;
    }
  }
  public async receiveStream(
    context: BSBService | BSBServiceClient<any>,
    pluginName: string,
    event: string,
    listener: { (error: Error | null, stream: Readable): Promise<void> },
    timeoutSeconds?: number
  ): Promise<string> {
    const self = this;
    const plugin = await this.getPluginForEvent(
      "receiveStream",
      pluginName,
      event
    );
    return await plugin.plugin.receiveStream(
      event,
      async (error: Error | null, stream: Readable) =>
        self.handleOnReceiveStream.call(
          self,
          plugin.pluginName,
          pluginName,
          event,
          context,
          listener,
          error,
          stream
        ),
      timeoutSeconds
    );
  }
  public async sendStream(
    pluginName: string,
    event: string,
    streamId: string,
    stream: Readable
  ): Promise<void> {
    const start = process.hrtime();
    const plugin = await this.getPluginForEvent(
      "sendStream",
      pluginName,
      event
    );
    try {
      await SmartFunctionCallAsync(
        plugin.plugin,
        plugin.plugin.sendStream,
        event,
        streamId,
        stream
      );
      let diff = process.hrtime(start);
      this.log.reportStat(
        `sendstream-${plugin.pluginName}-${pluginName}-${event}`,
        (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
      );
    } catch (exc: any) {
      this.log.reportStat(
        `sendstream-${plugin.pluginName}-${pluginName}-${event}`,
        -1
      );
      this.log.error("sendStream error occured: ${error}", {
        error: exc.message ?? exc,
      });
      throw exc;
    }
  }
}
