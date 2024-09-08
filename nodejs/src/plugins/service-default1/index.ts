import {BSBService, BSBPluginEvents} from "../../index";
import {BSBServiceClientDefinition} from "../../base";

export interface Events
    extends BSBPluginEvents {
  emitEvents: {
    onEmittable(a: number, b: number): Promise<void>;
  };
  onEvents: {
    onReceivable(a: number, b: number): Promise<void>;
  };
  emitReturnableEvents: {
    onReverseReturnable(a: number, b: number): Promise<number>;
  };
  onReturnableEvents: {
    onReturnable(a: number, b: number): Promise<number>;
  };
  emitBroadcast: {};
  onBroadcast: {};
}

export class Plugin
    extends BSBService<null, Events> {
  public static PLUGIN_CLIENT: BSBServiceClientDefinition = {
    name: "service-default1",
  }
  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public methods = {
    callableMethod: async (traceId: string, a: number, b: number) => {
      this.log.warn("callableMethod ({a},{b})", {a, b});
      this.events.emitEvent("onEmittable", traceId, a, b);
      return a * b;
    },
    testMethod: (): boolean => {
      return true;
    },
  };

  dispose?(): void;

  run?(): void | Promise<void>;

  public async init() {
    this.log.info("INIT SERVICE");
    this.events.onEvent("onReceivable", async (traceId: string, a: number, b: number) => {
      this.log.warn("received onReceivable ({a},{b}", {a, b});
      //process.exit(3);
    });
    this.events.onReturnableEvent(
        "onReturnable",
        async (traceId: string, a: number, b: number) => {
          this.log.warn("RECEIVED onReturnable ({a},{b})", {a, b});
          const result = await this.events.emitEventAndReturn(
              "onReverseReturnable",
              traceId,
              5,
              a,
              b,
          );
          this.log.warn("RETURNED onReverseReturnable ({result})", {
            result,
          });
          return result;
        },
    );
  }
}
