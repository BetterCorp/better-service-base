import { BSBService, BSBServiceTypes } from "../../base/service";
import { BSBServiceClient } from "../../base/serviceClient";

export interface ServiceTypes extends BSBServiceTypes {
  methods: {
    callableMethod(a: number, b: number): Promise<number>;
  };
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

export class Plugin extends BSBService<any, ServiceTypes> {
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
      console.log('calledI: ' + this.count);
      this.log.warn("received onReceivable ({a},{b}", { a, b });
      //process.exit(3);
    });
    this.events.onReturnableEvent(
      "onReturnable",
      async (a: number, b: number) => {
        this.log.warn("RECEIVED onReturnable ({a},{b})", { a, b });
        let result = await this.events.emitEventAndReturn(
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

export class testClient extends BSBServiceClient<ServiceTypes> {
  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public dispose?(): void;
  public run?(): Promise<void>;
  public readonly pluginName: string = "service-default1";
  private count = 0;
  public async init(): Promise<void> {
    this.events.onEvent("onEmittable", async (a: number, b: number) => {
      this.log.warn("onEmittable ({a},{b})", { a, b });
    });
    this.events.onReturnableEvent(
      "onReverseReturnable",
      async (a: number, b: number) => {
        this.count++;
        console.log('called: ' + this.count);
        this.log.warn("onReverseReturnable ({a},{b})", { a, b });
        return a * b;
      }
    );
    await this.events.emitEvent("onReceivable", 56, 7);
  }
  async abc(a: number, b: number, c: number, d: number): Promise<void> {
    this.log.warn("TESTING ABC CALL ({result})", {
      result: await this.callMethod("callableMethod", a, b),
    });
    this.log.warn("TESTING onReturnable ({result})", {
      result: await this.events.emitEventAndReturn("onReturnable", 5, c, d),
    });
  }
}
