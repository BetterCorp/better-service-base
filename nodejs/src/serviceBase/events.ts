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
import { MS_PER_NS, NS_PER_SEC } from "./serviceBase";

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
        plugin.mappedName,
        cwd,
        plugin.pluginDir,
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

  generateEventsForService(
    pluginName: string,
    mappedPluginName: string
  ): IServiceEvents<any, any, any, any> {
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
          async (iargs: Array<any>) => {
            const start = process.hrtime();
            try {
              await args[1](...iargs);
              let diff = process.hrtime(start);
              await self.log.reportStat(
                `on-event-${mappedPluginName}-${args[0]}`,
                (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
              );
            } catch (exc: any) {
              await self.log.reportStat(
                `on-event-${mappedPluginName}-${args[0]}`,
                -1
              );
              await self.log.error(exc);
              throw exc;
            }
          }
        );
      },
      onEventSpecific: async <TA extends string>(serverId: string,
        ...args: DynamicallyReferencedMethodOnIEvents<
          DynamicallyReferencedMethodType<any>,
          TA,
          false
        >
      ): Promise<void> => {
        await self._activeEvents!.onEvent(
          pluginName,
          `${mappedPluginName}-${serverId}`,
          args[0],
          async (iargs: Array<any>) => {
            const start = process.hrtime();
            try {
              await args[1](...iargs);
              let diff = process.hrtime(start);
              await self.log.reportStat(
                `on-event-${mappedPluginName}-${serverId}-${args[0]}`,
                (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
              );
            } catch (exc: any) {
              await self.log.reportStat(
                `on-event-${mappedPluginName}-${serverId}-${args[0]}`,
                -1
              );
              await self.log.error(exc);
              throw exc;
            }
          }
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
      emitEventSpecific: async <TA extends string>(serverId: string,
        ...args: DynamicallyReferencedMethodEmitIEvents<
          DynamicallyReferencedMethodType<any>,
          TA
        >
      ): Promise<void> => {
        let event = args.splice(0, 1)[0] as string;
        await self._activeEvents!.emitEvent(
          pluginName,
          `${mappedPluginName}-${serverId}`,
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
          async (iargs: Array<any>) => {
            const start = process.hrtime();
            try {
              const data = await args[1](...iargs);
              let diff = process.hrtime(start);
              await self.log.reportStat(
                `on-revent-${mappedPluginName}-${args[0]}`,
                (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
              );
              return data;
            } catch (exc: any) {
              await self.log.reportStat(
                `on-revent-${mappedPluginName}-${args[0]}`,
                -1
              );
              await self.log.error(exc);
              throw exc;
            }
          }
        );
      },
      onReturnableEventSpecific: async <TA extends string>(serverId: string,
        ...args: DynamicallyReferencedMethodOnIEvents<
          DynamicallyReferencedMethodType<any>,
          TA,
          true
        >
      ): Promise<void> => {
        this._activeEvents!.onReturnableEvent(
          pluginName,
          `${mappedPluginName}-${serverId}`,
          args[0],
          async (iargs: Array<any>) => {
            const start = process.hrtime();
            try {
              const data = await args[1](...iargs);
              let diff = process.hrtime(start);
              await self.log.reportStat(
                `on-revent-${mappedPluginName}-${serverId}-${args[0]}`,
                (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
              );
              return data;
            } catch (exc: any) {
              await self.log.reportStat(
                `on-revent-${mappedPluginName}-${serverId}-${args[0]}`,
                -1
              );
              await self.log.error(exc);
              throw exc;
            }
          }
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
        const start = process.hrtime();
        try {
          let event = args.splice(0, 1)[0] as string;
          const data = this._activeEvents!.emitEventAndReturn(
            pluginName,
            mappedPluginName,
            event,
            15,
            args
          );
          let diff = process.hrtime(start);
          await self.log.reportStat(
            `emit-revent-${mappedPluginName}-${args[0]}`,
            (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
          );
          return data;
        } catch (exc: any) {
          await self.log.reportStat(
            `emit-revent-${mappedPluginName}-${args[0]}`,
            -1
          );
          await self.log.error(exc);
          throw exc;
        }
      },
      emitEventAndReturnSpecific: async <TA extends string>(serverId: string,
        ...args: DynamicallyReferencedMethodEmitEARIEvents<
          DynamicallyReferencedMethodType<any>,
          TA,
          true,
          false
        >
      ): Promise<any> => {
        const start = process.hrtime();
        try {
          let event = args.splice(0, 1)[0] as string;
          const data = this._activeEvents!.emitEventAndReturn(
            pluginName,
            `${mappedPluginName}-${serverId}`,
            event,
            15,
            args
          );
          let diff = process.hrtime(start);
          await self.log.reportStat(
            `emit-revent-${mappedPluginName}-${serverId}-${args[0]}`,
            (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
          );
          return data;
        } catch (exc: any) {
          await self.log.reportStat(
            `emit-revent-${mappedPluginName}-${serverId}-${args[0]}`,
            -1
          );
          await self.log.error(exc);
          throw exc;
        }
      },
      emitEventAndReturnTimed: async <TA extends string>(
        ...args: DynamicallyReferencedMethodEmitEARIEvents<
          DynamicallyReferencedMethodType<any>,
          TA,
          true,
          true
        >
      ): Promise<any> => {
        const start = process.hrtime();
        try {
          let event = args.splice(0, 1)[0] as string;
          let timeoutSeconds = args.splice(0, 1)[0] as number;
          const data = this._activeEvents!.emitEventAndReturn(
            pluginName,
            mappedPluginName,
            event,
            timeoutSeconds,
            args
          );
          let diff = process.hrtime(start);
          await self.log.reportStat(
            `emit-rtevent-${mappedPluginName}-${args[0]}`,
            (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
          );
          return data;
        } catch (exc: any) {
          await self.log.reportStat(
            `emit-rtevent-${mappedPluginName}-${args[0]}`,
            -1
          );
          await self.log.error(exc);
          throw exc;
        }
      },
      emitEventAndReturnTimedSpecific: async <TA extends string>(serverId: string,
        ...args: DynamicallyReferencedMethodEmitEARIEvents<
          DynamicallyReferencedMethodType<any>,
          TA,
          true,
          true
        >
      ): Promise<any> => {
        const start = process.hrtime();
        try {
          let event = args.splice(0, 1)[0] as string;
          let timeoutSeconds = args.splice(0, 1)[0] as number;
          const data = this._activeEvents!.emitEventAndReturn(
            pluginName,
            `${mappedPluginName}-${serverId}`,
            event,
            timeoutSeconds,
            args
          );
          let diff = process.hrtime(start);
          await self.log.reportStat(
            `emit-rtevent-${mappedPluginName}-${serverId}-${args[0]}`,
            (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
          );
          return data;
        } catch (exc: any) {
          await self.log.reportStat(
            `emit-rtevent-${mappedPluginName}-${serverId}-${args[0]}`,
            -1
          );
          await self.log.error(exc);
          throw exc;
        }
      },
      receiveStream: async (
        listener: { (error: Error | null, stream: Readable): Promise<void> },
        timeoutSeconds?: number
      ): Promise<string> => {
        const start = process.hrtime();
        try {
          const data = await self._activeEvents!.receiveStream(
            mappedPluginName,
            listener,
            timeoutSeconds
          );
          let diff = process.hrtime(start);
          await self.log.reportStat(
            `receive-stream-${mappedPluginName}`,
            (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
          );
          return data;
        } catch (exc: any) {
          await self.log.reportStat(`receive-stream-${mappedPluginName}`, -1);
          await self.log.error(exc);
          throw exc;
        }
      },
      sendStream: async (streamId: string, stream: Readable): Promise<void> => {
        const start = process.hrtime();
        try {
          await self._activeEvents!.sendStream(
            mappedPluginName,
            streamId,
            stream
          );
          let diff = process.hrtime(start);
          await self.log.reportStat(
            `receive-stream-${mappedPluginName}`,
            (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS
          );
          return;
        } catch (exc: any) {
          await self.log.reportStat(`receive-stream-${mappedPluginName}`, -1);
          await self.log.error(exc);
          throw exc;
        }
      },
    };
  }
}
