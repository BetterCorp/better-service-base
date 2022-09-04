import { IPluginLogger } from "../interfaces/logger";
import { SBBase } from "./base";
import { ConfigBase } from "../config/config";
import { IReadyPlugin } from "../interfaces/service";
import { EventsBase } from "../events/events";
import {
  DynamicallyReferencedMethodEmitEARIEvents,
  DynamicallyReferencedMethodEmitIEvents,
  DynamicallyReferencedMethodOnIEvents,
  IServiceEvents,
} from "../interfaces/events";
import { DynamicallyReferencedMethodType } from "@bettercorp/tools/lib/Interfaces";
import { Readable } from "stream";

export class SBEvents {
  private log: IPluginLogger;
  private _activeEvents: EventsBase | undefined;
  constructor(log: IPluginLogger) {
    this.log = log;
  }

  public dispose() {
    if (this._activeEvents !== undefined) this._activeEvents.dispose();
  }

  async setupEvents(
    appId: string,
    runningDebug: boolean,
    runningLive: boolean,
    cwd: string,
    config: ConfigBase,
    plugin: IReadyPlugin,
    pluginLog: IPluginLogger
  ) {
    await this.log.debug(`Import events plugin: {name} from {file}`, {
      name: plugin.name,
      file: plugin.pluginFile,
    });
    const importedPlugin = await import(plugin.pluginFile);

    await this.log.debug(`Construct events plugin: {name}`, {
      name: plugin.name,
    });

    let eventsPlugin =
      new (importedPlugin.Events as unknown as typeof EventsBase)(
        plugin.name,
        cwd,
        pluginLog
      );
    await this.log.debug(`Create events plugin: {name}`, {
      name: plugin.name,
    });

    await this.log.info(
      "Setting up {pluginName} ({mappedName}) as new base events platform",
      {
        pluginName: plugin.name,
        mappedName: plugin.mappedName,
      }
    );
    await this.log.info("Builing {pluginName} as new base events platform", {
      pluginName: plugin.name,
    });
    SBBase.setupPlugin(appId, runningDebug, runningLive, eventsPlugin, config);

    this._activeEvents = eventsPlugin;
    await this._activeEvents.init();
    await this.log.info(
      "Ready {pluginName} ({mappedName}) as new base events platform",
      {
        pluginName: plugin.name,
        mappedName: plugin.mappedName,
      }
    );
    if (this._activeEvents === null) {
      console.log("x");
    }
  }

  generateEventsForService(pluginName: string, mappedPluginName: string): IServiceEvents<any, any, any, any> {
    const self = this;
    return {
      onEvent: async <TA extends string>(
        ...args: DynamicallyReferencedMethodOnIEvents<
          DynamicallyReferencedMethodType<any>,
          TA,
          false
        >
      ): Promise<void> => {
        await self._activeEvents!.onEvent(
          pluginName,
          mappedPluginName,
          args[0],
          args[1]
        );
      },
      emitEvent: async <TA extends string>(
        ...args: DynamicallyReferencedMethodEmitIEvents<
          DynamicallyReferencedMethodType<any>,
          TA
        >
      ): Promise<void> => {
        let event = args.splice(0, 1)[0] as string;
        await self._activeEvents!.emitEvent(
          pluginName,
          mappedPluginName,
          event,
          args
        );
      },
      onReturnableEvent: async <TA extends string>(
        ...args: DynamicallyReferencedMethodOnIEvents<
          DynamicallyReferencedMethodType<any>,
          TA,
          true
        >
      ): Promise<void> => {
        this._activeEvents!.onReturnableEvent(
          pluginName,
          mappedPluginName,
          args[0],
          args[1] as (args: any[]) => Promise<any>
        );
      },
      emitEventAndReturn: async <TA extends string>(
        ...args: DynamicallyReferencedMethodEmitEARIEvents<
          DynamicallyReferencedMethodType<any>,
          TA,
          true,
          false
        >
      ): Promise<any> => {
        let event = args.splice(0, 1)[0] as string;
        return this._activeEvents!.emitEventAndReturn(
          pluginName,
          mappedPluginName,
          event,
          15,
          args
        );
      },
      emitEventAndReturnTimed: async <TA extends string>(
        ...args: DynamicallyReferencedMethodEmitEARIEvents<
          DynamicallyReferencedMethodType<any>,
          TA,
          true,
          true
        >
      ): Promise<any> => {
        let event = args.splice(0, 1)[0] as string;
        let timeoutSeconds = args.splice(0, 1)[0] as number;
        return this._activeEvents!.emitEventAndReturn(
          pluginName,
          mappedPluginName,
          event,
          timeoutSeconds,
          args
        );
      },
      receiveStream: async (
        listener: { (error: Error | null, stream: Readable): Promise<void> },
        timeoutSeconds?: number
      ): Promise<string> => {
        return await self._activeEvents!.receiveStream(
          mappedPluginName,
          listener,
          timeoutSeconds
        );
      },
      sendStream: async (streamId: string, stream: Readable): Promise<void> => {
        return await self._activeEvents!.sendStream(
          mappedPluginName,
          streamId,
          stream
        );
      },
    };
  }
}
