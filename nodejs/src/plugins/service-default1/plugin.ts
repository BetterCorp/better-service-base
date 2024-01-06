import { BSBService, BSBPluginEvents } from "../../";

export interface Events extends BSBPluginEvents {
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

export class Plugin extends BSBService<null, Events> {
  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public methods = {
    callableMethod: async (a: number, b: number) => {
      this.log.warn("callableMethod ({a},{b})", { a, b });
      this.events.emitEvent("onEmittable", a, b);
      return a * b;
    },
  };
  dispose?(): void;
  run?(): void | Promise<void>;

  private count = 0;
  public override async init() {
    this.log.info("INIT SERVICE");
    this.events.onEvent("onReceivable", async (a: number, b: number) => {
      this.count++;
      console.log("calledI: " + this.count);
      this.log.warn("received onReceivable ({a},{b}", { a, b });
      //process.exit(3);
    });
    this.events.onReturnableEvent(
      "onReturnable",
      async (a: number, b: number) => {
        this.log.warn("RECEIVED onReturnable ({a},{b})", { a, b });
        const result = await this.events.emitEventAndReturn(
          "onReverseReturnable",
          5,
          a,
          b
        );
        this.log.warn("RETURNED onReverseReturnable ({result})", {
          result,
        });
        return result;
      }
    );
  }
}
