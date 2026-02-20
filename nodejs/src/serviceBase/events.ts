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

import { Readable } from "node:stream";
import {
  BSBError,
  BSBEvents, BSBService, BSBServiceClient,
  ObservableBackend,
  SmartFunctionCallAsync,
  SmartFunctionCallSync,
  Tools,
} from "../base";
import {
  createFakeDTrace,
  DEBUG_MODE, DTrace,
  EventsEventTypes, EventsEventTypesBase,
  EventsFilter, EventsFilterDetailed,
  FilterOnType,
  Gauge, IPluginDefinition,
  IPluginObservable, LoadedPlugin,
  Observable,
} from "../interfaces";
import { Plugin as DefaultEvents } from "../plugins/events-default/index";
import { SBConfig } from "./config";
import { SBObservable } from "./observable";
import { SBPlugins } from "./plugins";
import { Counter } from "../interfaces";
import { MS_PER_NS, NS_PER_SEC } from "../base/base";

/**
 * @hidden
 */
function internalTrace(span: string): DTrace {
  return createFakeDTrace("serviceBase/SBEvents", span);
}

/**
 * BSB Events Controller
 * 
 * This class is responsible for managing the events in the BSB framework.
 * If you have a specific way of managing events, you can extend this class and then use your own class when creating the ServiceBase instance.
 * 
 * @group Events
 * @category Core
 */
export class SBEvents {
  /**
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/SBEvents.html | API: SBEvents}
   */
  private events: Array<{
    name: string;
    plugin: BSBEvents<any>;
    on?: EventsFilter;
    onTypeof: FilterOnType;
  }> = [];
  private readonly mode: DEBUG_MODE = "development";
  private readonly appId: string;
  private readonly cwd: string;
  private sbPlugins: SBPlugins;
  private readonly observableBackend: IPluginObservable;
  private metricCounters!: Record<EventsEventTypes, Counter<'pluginName' | 'event'>>;
  private metricGauges!: Record<EventsEventTypes, Gauge<'pluginName' | 'event'>>;
  private createObservable: (trace: DTrace, pluginName: string, attributes?: Record<string, string | number | boolean>) => Observable;

  constructor(
    appId: string,
    mode: DEBUG_MODE,
    cwd: string,
    sbPlugins: SBPlugins,
    sbObservable: SBObservable,
    createObservable: (trace: DTrace, pluginName: string, attributes?: Record<string, string | number | boolean>) => Observable,
  ) {
    this.appId = appId;
    this.mode = mode;
    this.cwd = cwd;
    this.sbPlugins = sbPlugins;
    this.createObservable = createObservable;
    const eventsPluginName = "core-events";
    this.observableBackend = new ObservableBackend(this.mode, appId, eventsPluginName, sbObservable);
  }

  public dispose() {
    for (let eventsIndex = 0; eventsIndex < this.events.length; eventsIndex++) {
      if (this.events[eventsIndex].plugin.dispose !== undefined) {
        SmartFunctionCallSync(
          this.events[eventsIndex].plugin,
          this.events[eventsIndex].plugin.dispose,
        );
      }
    }
  }

  private getPluginsMatchingTriggerEvent(
    event: EventsEventTypes,
    plugin: string,
  ) {
    return this.events.find((eventPlugin) => {
      if (Tools.isNullOrUndefined(eventPlugin.plugin)) {
        return false;
      }
      if (Tools.isNullOrUndefined(eventPlugin.on)) {
        return true;
      }
      switch (eventPlugin.onTypeof) {
        case "all":
          return true;
        case "events":
          return (
            eventPlugin.on as Array<EventsEventTypes>
          ).includes(event);
        case "eventsState":
          if (
            Tools.isNullOrUndefined(
              (
                eventPlugin.on as Record<EventsEventTypes, boolean>
              )[event],
            )
          ) {
            return false;
          }
          return (
            eventPlugin.on as Record<EventsEventTypes, boolean>
          )[event];
        case "eventsPlugins":
          if (
            Tools.isNullOrUndefined(
              (
                eventPlugin.on as Record<EventsEventTypes, Array<string>>
              )[event],
            )
          ) {
            return false;
          }
          return (
            eventPlugin.on as Record<EventsEventTypes, Array<string>>
          )[
            event
          ].includes(plugin);
        case "eventsDetailed":
          if (
            Tools.isNullOrUndefined(
              (
                eventPlugin.on as EventsFilterDetailed
              )[event],
            )
          ) {
            return false;
          }
          if ((
            eventPlugin.on as EventsFilterDetailed
          )[event].enabled !== true) {
            return false;
          }
          return (
            eventPlugin.on as EventsFilterDetailed
          )[
            event
          ].plugins.includes(plugin);
      }
    });
  }

  private getPluginForEvent(
    eventAs: EventsEventTypes,
    plugin: string,
    event: string,
  ): {
    pluginName: string;
    plugin: BSBEvents<any>;
  } {
    const matchingEvent = this.getPluginsMatchingTriggerEvent(eventAs, plugin);
    if (matchingEvent === undefined) {
      throw new BSBError(
        internalTrace(`getPluginForEvent:${eventAs}:${plugin}:${event}`),
        "No plugins found to match event: plugin: {plugin} - eventAs: {eventAs} - event: {event}",
        { eventAs, plugin, event },
      );
    }
    return {
      plugin: matchingEvent.plugin,
      pluginName: matchingEvent.name,
    };
  }

  public async init(sbConfig: SBConfig, sbObservable: SBObservable) {
    const tTrace = internalTrace("init");
    this.observableBackend.debug(tTrace, "INIT SBEvents");

    this.metricCounters = {} as any;
    this.metricGauges = {} as any;
    for (const event of Object.keys(EventsEventTypesBase) as Array<keyof typeof EventsEventTypesBase>) {
      this.metricCounters[event] = this.observableBackend.createCounter(event, 'BSB Internal Events ' + event, 'Internal metrics for BSB events');
      this.metricGauges[event] = this.observableBackend.createGauge(event, 'BSB Internal Events ' + event, 'Internal metrics for BSB events');
    }

    const plugins = await sbConfig.getEventsPlugins(tTrace);
    for (const plugin of Object.keys(plugins)) {
      await this.addEvents(
        sbConfig,
        sbObservable,
        {
          name: plugin,
          package: plugins[plugin].package,
          plugin: plugins[plugin].plugin,
          version: plugins[plugin].version ?? "",
        },
        plugins[plugin].filter,
      );
    }
    this.observableBackend.info(tTrace, "Adding \"events-default\" as events");
    this.events.push({
      name: "events-default",
      plugin: new DefaultEvents({
        appId: this.appId,
        mode: this.mode,
        pluginName: "events-default",
        cwd: this.cwd,
        packageCwd: this.cwd,
        pluginCwd: this.cwd,
        config: undefined,
        sbObservable,
        pluginVersion: "0.0.0"
      }),
      on: undefined,
      onTypeof: "all",
    });
  }

  public async run() {
    if (this.events.length === 1) {
      return;
    }
    // we want to see if any plugins (ignore events-default) are listening to all events - it so, there is no reason to keep the events-default plugin, so we can dispose and remove it
    const events = this.events.filter((x) => x.name !== "events-default");
    const allEvents = events.filter((x) => x.onTypeof === "all");
    if (allEvents.length > 0) {
      const defaultEvents = this.events.find(
        (x) => x.name === "events-default",
      );
      if (defaultEvents !== undefined) {
        if (defaultEvents.plugin.dispose !== undefined) {
          SmartFunctionCallSync(
            defaultEvents.plugin,
            defaultEvents.plugin.dispose,
          );
        }
        this.events = this.events.filter((x) => x.name !== "events-default");
      }
    }
  }

  public async addPlugin(
    sbObservable: SBObservable,
    plugin: IPluginDefinition,
    reference: LoadedPlugin<"events">,
    config: any,
    filter?: EventsFilter,
  ) {
    const tTrace = internalTrace(`addPlugin`);
    this.observableBackend.debug(tTrace, `Get plugin config: {name}`, {
      name: plugin.name,
    });

    this.observableBackend.debug(tTrace, `Construct events plugin: {name}`, {
      name: plugin.name,
    });

    const eventsPlugin = new reference.plugin({
      appId: this.appId,
      mode: this.mode,
      pluginName: reference.name,
      cwd: this.cwd,
      packageCwd: reference.packageCwd,
      pluginCwd: reference.pluginCwd,
      config: config,
      sbObservable,
      pluginVersion: reference.version
    });
    this.observableBackend.info(tTrace, "Adding {pluginName} as events with filter: ", {
      pluginName: plugin.name,
      //filters: filter
    });
    let eventAsType: FilterOnType = "all";

    if (filter) {
      if (Array.isArray(filter)) {
        eventAsType = "events";
      } else if (typeof filter === "object") {
        const methods = Object.keys(EventsEventTypesBase);
        for (const method of methods) {
          if (
            (
              filter as unknown as Record<string, any>
            )[method] !== undefined
          ) {
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

    this.observableBackend.info(tTrace, "Ready {pluginName} ({mappedName})", {
      pluginName: plugin.plugin,
      mappedName: plugin.name,
    });

    const obs = this.createObservable(tTrace, "events");
    await SmartFunctionCallAsync(eventsPlugin, eventsPlugin.init, obs);

    return eventsPlugin;
  }

  private async addEvents(
    sbConfig: SBConfig,
    sbObservable: SBObservable,
    plugin: IPluginDefinition,
    filter?: EventsFilter,
  ) {
    const tTrace = internalTrace(`addEvents`);
    this.observableBackend.debug(tTrace, "Add events {name} from ({package}){file}", {
      package: plugin.package ?? "this project",
      name: plugin.name,
      file: plugin.plugin,
    });
    if (plugin.name === "events-default") {
      return;
    }
    this.observableBackend.debug(tTrace, `Import events plugin: {name} from ({package}){file}`, {
      package: plugin.package ?? "this project",
      name: plugin.name,
      file: plugin.plugin,
    });

    const newPlugin = await this.sbPlugins.loadPlugin<"events">(
      this.observableBackend,
      plugin.package ?? null,
      plugin.plugin,
      plugin.name,
      plugin.version ?? null,
    );
    if (newPlugin === null || !newPlugin.success) {
      this.observableBackend.error(tTrace,
        "Failed to import events plugin: {name} from ({package}){file}",
        {
          package: plugin.package ?? "this project",
          name: plugin.name,
          file: plugin.plugin,
        },
      );
      return;
    }

    let pluginConfig =
      (
        await sbConfig.getPluginConfig(tTrace, "events", plugin.name)
      ) ?? null;

    if (
      !Tools.isNullOrUndefined(newPlugin.data.serviceConfig) &&
      Tools.isObject(newPlugin.data.serviceConfig) &&
      !Tools.isNullOrUndefined(newPlugin.data.serviceConfig.validationSchema)
    ) {
      this.observableBackend.debug(tTrace, "Validate plugin config: {name}", { name: plugin.name });
      pluginConfig =
        newPlugin.data.serviceConfig.validationSchema.parse(pluginConfig ?? undefined);
    }

    await this.addPlugin(sbObservable, plugin, newPlugin.data, pluginConfig, filter);
  }

  private async handleOnBroadcast(
    trace: DTrace,
    eventsPluginName: string,
    pluginName: string,
    event: string,
    context: BSBService | BSBServiceClient<any>,
    listener: { (trace: DTrace, ...args: Array<any>): Promise<void> | void },
    iargs: Array<any>,
  ) {
    const start = process.hrtime();
    try {
      await SmartFunctionCallAsync(context, listener, trace, ...iargs);
      const diff = process.hrtime(start);
      const time = (
        diff[0] * NS_PER_SEC + diff[1]
      ) * MS_PER_NS;
      this.observableBackend.debug(trace,
        "on-broadcast-{eventsPluginName}-{pluginName}-{event}:{time}",
        {
          eventsPluginName,
          pluginName,
          event,
          time
        },
      );
      this.metricCounters["onBroadcast"].increment(1, { pluginName, event });
      this.metricGauges["onBroadcast"].set(time, { pluginName, event });
    } catch (exc: any) {
      this.observableBackend.error(trace,
        "[{eventsPluginName}:{pluginName}:{event}:handleOnBroadcast] error occured: ${error}",
        {
          error: exc.message ?? exc,
          eventsPluginName,
          pluginName,
          event,
        },
      );
      throw exc;
    }
  }

  public async onBroadcast(
    context: BSBService<any, any> | BSBServiceClient<any>,
    trace: DTrace,
    pluginName: string,
    event: string,
    listener: { (trace: DTrace, ...args: Array<any>): Promise<void> | void },
  ): Promise<void> {
    const self = this;
    const plugin = this.getPluginForEvent(
      "onBroadcast",
      pluginName,
      event,
    );
    const obs = this.createObservable(trace, "events");
    return await plugin.plugin.onBroadcast(obs, pluginName, event, async (iObs: Observable, iargs: Array<any>) =>
      self.handleOnBroadcast.call(
        self,
        iObs.trace,
        plugin.pluginName,
        pluginName,
        event,
        context,
        listener,
        iargs,
      ),
    );
  }

  public async emitBroadcast(
    trace: DTrace,
    pluginName: string,
    event: string,
    ...args: Array<any>
  ): Promise<void> {
    const plugin = this.getPluginForEvent(
      "emitBroadcast",
      pluginName,
      event,
    );
    this.observableBackend.debug(trace,
      "emit-broadcast-{pluginName}-{event}:{time}",
      {
        pluginName,
        event,
        time: 1,
      },
    );
    const obs = this.createObservable(trace, "events");
    await SmartFunctionCallAsync(
      plugin.plugin,
      plugin.plugin.emitBroadcast,
      obs,
      pluginName,
      event,
      args,
    );
  }

  private async handleOnEvent(
    trace: DTrace,
    eventsPluginName: string,
    pluginName: string,
    event: string,
    context: BSBService | BSBServiceClient<any>,
    listener: { (trace: DTrace, ...args: Array<any>): Promise<void> | void },
    iargs: Array<any>,
  ) {
    const start = process.hrtime();
    try {
      await SmartFunctionCallAsync(context, listener, trace, ...iargs);
      const diff = process.hrtime(start);
      const time = (
        diff[0] * NS_PER_SEC + diff[1]
      ) * MS_PER_NS;
      this.observableBackend.debug(trace,
        "on-event-{eventsPluginName}-{pluginName}-{event}:{time}",
        {
          eventsPluginName,
          pluginName,
          event,
          time
        },
      );
      this.metricCounters["onEvent"].increment(1, { pluginName, event });
      this.metricGauges["onEvent"].set(time, { pluginName, event });
    } catch (exc: any) {
      this.observableBackend.error(trace,
        "[{eventsPluginName}:{pluginName}:{event}:handleOnEvent] error occured: ${error}",
        {
          error: exc.message ?? exc,
          eventsPluginName,
          pluginName,
          event,
        },
      );
      throw exc;
    }
  }

  public async onEvent(
    trace: DTrace,
    context: BSBService | BSBServiceClient<any>,
    pluginName: string,
    event: string,
    listener: { (trace: DTrace, ...args: Array<any>): Promise<void> | void },
  ): Promise<void> {
    const self = this;
    const plugin = this.getPluginForEvent("onEvent", pluginName, event);
    const obs = this.createObservable(trace, "events");
    return await plugin.plugin.onEvent(
      obs,
      plugin.pluginName,
      event,
      async (iObs: Observable, iargs: Array<any>) =>
        self.handleOnEvent.call(
          self,
          iObs.trace,
          plugin.pluginName,
          pluginName,
          event,
          context,
          listener,
          iargs,
        ),
    );
  }

  public async onEventSpecific(
    trace: DTrace,
    serverId: string,
    context: BSBService | BSBServiceClient<any>,
    pluginName: string,
    event: string,
    listener: { (trace: DTrace, ...args: Array<any>): Promise<void> | void },
  ): Promise<void> {
    const self = this;
    const plugin = this.getPluginForEvent("onEvent", pluginName, event);
    const obs = this.createObservable(trace, "events");
    return await plugin.plugin.onEvent(
      obs,
      pluginName,
      event + "-" + serverId,
      async (iObs: Observable, iargs: Array<any>) =>
        self.handleOnEvent.call(
          self,
          iObs.trace,
          plugin.pluginName,
          pluginName,
          event + "-" + serverId,
          context,
          listener,
          iargs,
        ),
    );
  }

  public async emitEvent(
    trace: DTrace,
    pluginName: string,
    event: string,
    ...args: Array<any>
  ): Promise<void> {
    const plugin = this.getPluginForEvent("emitEvent", pluginName, event);
    this.observableBackend.debug(trace,
      "emit-event-{pluginName}-{event}:{time}",
      {
        pluginName,
        event,
        time: 1,
      },
    );
    const obs = this.createObservable(trace, "events");
    await SmartFunctionCallAsync(
      plugin.plugin,
      plugin.plugin.emitEvent,
      obs,
      pluginName,
      event,
      args,
    );
  }

  public async emitEventSpecific(
    trace: DTrace,
    serverId: string,
    pluginName: string,
    event: string,
    ...args: Array<any>
  ): Promise<void> {
    const plugin = this.getPluginForEvent("emitEvent", pluginName, event);
    this.observableBackend.debug(trace,
      "emit-event-{pluginName}-{event}:{time}",
      {
        pluginName,
        event,
        time: 1,
      },
    );
    const obs = this.createObservable(trace, "events");
    await SmartFunctionCallAsync(
      plugin.plugin,
      plugin.plugin.emitEvent,
      obs,
      pluginName,
      event + "-" + serverId,
      args,
    );
  }

  private async handleOnReturnableEvent(
    trace: DTrace,
    eventsPluginName: string,
    pluginName: string,
    event: string,
    context: BSBService | BSBServiceClient<any>,
    listener: { (trace: DTrace, ...args: Array<any>): Promise<any> | any },
    iargs: Array<any>,
  ) {
    const start = process.hrtime();
    try {
      const resp = await SmartFunctionCallAsync(context, listener, trace, ...iargs);
      const diff = process.hrtime(start);
      const time = (
        diff[0] * NS_PER_SEC + diff[1]
      ) * MS_PER_NS;
      this.observableBackend.debug(trace,
        "on-returnableevent-{eventsPluginName}-{pluginName}-{event}:{time}",
        {
          eventsPluginName,
          pluginName,
          event,
          time,
        },
      );
      this.metricCounters["onReturnableEvent"].increment(1, { pluginName, event });
      this.metricGauges["onReturnableEvent"].set(time, { pluginName, event });
      return resp;
    } catch (exc: any) {
      this.observableBackend.error(trace,
        "[{eventsPluginName}:{pluginName}:{event}:handleOnReturnableEvent] error occured: ${error}",
        {
          error: exc.message ?? exc,
          eventsPluginName,
          pluginName,
          event,
        },
      );
      throw exc;
    }
  }

  public async onReturnableEvent(
    trace: DTrace,
    context: BSBService | BSBServiceClient<any>,
    pluginName: string,
    event: string,
    listener: { (trace: DTrace, ...args: Array<any>): Promise<any> | any },
  ): Promise<void> {
    const self = this;
    const plugin = this.getPluginForEvent(
      "onReturnableEvent",
      pluginName,
      event,
    );
    const obs = this.createObservable(trace, "events");
    return await plugin.plugin.onReturnableEvent(
      obs,
      pluginName,
      event,
      async (iObs: Observable, iargs: Array<any>) =>
        self.handleOnReturnableEvent.call(
          self,
          iObs.trace,
          plugin.pluginName,
          pluginName,
          event,
          context,
          listener,
          iargs,
        ),
    );
  }

  public async onReturnableEventSpecific(
    trace: DTrace,
    serverId: string,
    context: BSBService | BSBServiceClient<any>,
    pluginName: string,
    event: string,
    listener: { (trace: DTrace, ...args: Array<any>): Promise<any> | any },
  ): Promise<void> {
    const self = this;
    const plugin = this.getPluginForEvent(
      "onReturnableEvent",
      pluginName,
      event,
    );
    const obs = this.createObservable(trace, "events");
    return await plugin.plugin.onReturnableEvent(
      obs,
      pluginName,
      event + "-" + serverId,
      async (iObs: Observable, iargs: Array<any>) =>
        self.handleOnReturnableEvent.call(
          self,
          iObs.trace,
          plugin.pluginName,
          pluginName,
          event + "-" + serverId,
          context,
          listener,
          iargs,
        ),
    );
  }

  public async emitEventAndReturn(
    trace: DTrace,
    pluginName: string,
    event: string,
    timeoutSeconds: number,
    ...args: Array<any>
  ): Promise<any> {
    const start = process.hrtime();
    const plugin = this.getPluginForEvent(
      "emitEventAndReturn",
      pluginName,
      event,
    );
    try {
      const obs = this.createObservable(trace, "events");
      const resp = await SmartFunctionCallAsync(
        plugin.plugin,
        plugin.plugin.emitEventAndReturn,
        obs,
        pluginName,
        event,
        timeoutSeconds,
        args,
      );
      const diff = process.hrtime(start);
      const time = (
        diff[0] * NS_PER_SEC + diff[1]
      ) * MS_PER_NS;
      this.observableBackend.debug(trace,
        "emit-eventandreturn-{pluginName}-{event}:{time}",
        {
          pluginName,
          event,
          time,
        },
      );
      this.metricCounters["emitEventAndReturn"].increment(1, { pluginName, event });
      this.metricGauges["emitEventAndReturn"].set(time, { pluginName, event });
      return resp;
    } catch (exc: any) {
      this.observableBackend.error(trace,
        "[{eventsPluginName}:{pluginName}:{event}:emitEventAndReturn] error occured: ${error}",
        {
          error: exc.message ?? exc,
          eventsPluginName: plugin.pluginName,
          pluginName,
          event,
        },
      );
      throw exc;
    }
  }

  public async emitEventAndReturnSpecific(
    trace: DTrace,
    serverId: string,
    pluginName: string,
    event: string,
    timeoutSeconds: number,
    ...args: Array<any>
  ): Promise<any> {
    const start = process.hrtime();
    const plugin = this.getPluginForEvent(
      "emitEventAndReturn",
      pluginName,
      event,
    );
    try {
      const obs = this.createObservable(trace, "events");
      const resp = await SmartFunctionCallAsync(
        plugin.plugin,
        plugin.plugin.emitEventAndReturn,
        obs,
        pluginName,
        event + "-" + serverId,
        timeoutSeconds,
        args,
      );
      const diff = process.hrtime(start);
      const time = (
        diff[0] * NS_PER_SEC + diff[1]
      ) * MS_PER_NS;
      this.observableBackend.debug(trace,
        "emit-eventandreturn-{pluginName}-{event}:{time}",
        {
          pluginName,
          event,
          time,
        },
      );
      this.metricCounters["emitEventAndReturnSpecific"].increment(1, { pluginName, event });
      this.metricGauges["emitEventAndReturnSpecific"].set(time, { pluginName, event });
      return resp;
    } catch (exc: any) {
      this.observableBackend.error(trace,
        "[{eventsPluginName}:{pluginName}:{event}:emitEventAndReturnSpecific] error occured: ${error}",
        {
          error: exc.message ?? exc,
          eventsPluginName: plugin.pluginName,
          pluginName,
          event,
        },
      );
      throw exc;
    }
  }

  private async handleOnReceiveStream(
    trace: DTrace,
    eventsPluginName: string,
    pluginName: string,
    event: string,
    context: BSBService | BSBServiceClient<any>,
    listener: { (error: Error | null, stream: Readable): Promise<void> },
    error: Error | null,
    stream: Readable,
  ) {
    const start = process.hrtime();
    try {
      const resp = await SmartFunctionCallAsync(
        context,
        listener,
        error,
        stream,
      );
      const diff = process.hrtime(start);
      const time = (
        diff[0] * NS_PER_SEC + diff[1]
      ) * MS_PER_NS;
      this.observableBackend.debug(trace,
        "receivestream-{eventsPluginName}-{pluginName}-{event}:{time}",
        {
          eventsPluginName,
          pluginName,
          event,
          time,
        },
      );
      this.metricCounters["receiveStream"].increment(1, { pluginName, event });
      this.metricGauges["receiveStream"].set(time, { pluginName, event });
      return resp;
    } catch (exc: any) {
      this.observableBackend.error(trace,
        "[{eventsPluginName}:{pluginName}:{event}:handleOnReceiveStream] error occured: ${error}",
        {
          error: exc.message ?? exc,
          eventsPluginName,
          pluginName,
          event,
        },
      );
      throw exc;
    }
  }

  public async receiveStream(
    trace: DTrace,
    context: BSBService | BSBServiceClient<any>,
    pluginName: string,
    event: string,
    listener: { (error: Error | null, stream: Readable): Promise<void> },
    timeoutSeconds?: number,
  ): Promise<string> {
    const self = this;
    const plugin = this.getPluginForEvent(
      "receiveStream",
      pluginName,
      event,
    );
    const obs = this.createObservable(trace, "events");
    return await plugin.plugin.receiveStream(
      obs,
      plugin.pluginName,
      event,
      async (iObs: Observable, error: Error | null, stream: Readable) =>
        self.handleOnReceiveStream.call(
          self,
          trace,
          plugin.pluginName,
          pluginName,
          event,
          context,
          listener,
          error,
          stream,
        ),
      timeoutSeconds,
    );
  }

  public async sendStream(
    trace: DTrace,
    pluginName: string,
    event: string,
    streamId: string,
    stream: Readable,
  ): Promise<void> {
    const start = process.hrtime();
    const plugin = this.getPluginForEvent(
      "sendStream",
      pluginName,
      event,
    );
    try {
      const obs = this.createObservable(trace, "events");
      await SmartFunctionCallAsync(
        plugin.plugin,
        plugin.plugin.sendStream,
        obs,
        plugin.pluginName,
        event,
        streamId,
        stream,
      );
      const diff = process.hrtime(start);
      const time = (
        diff[0] * NS_PER_SEC + diff[1]
      ) * MS_PER_NS;
      this.observableBackend.debug(
        trace,
        "sendstream-{pluginName}-{event}:{time}",
        {
          pluginName,
          event,
          time,
        },
      );
      this.metricCounters["sendStream"].increment(1, { pluginName, event });
      this.metricGauges["sendStream"].set(time, { pluginName, event });
    } catch (exc: any) {
      this.observableBackend.error(
        trace,
        "[{eventsPluginName}:{pluginName}:{streamId}:sendStream] error occured: ${error}",
        {
          error: exc.message ?? exc,
          eventsPluginName: plugin.pluginName,
          pluginName,
          streamId,
        },
      );
      throw exc;
    }
  }
}
