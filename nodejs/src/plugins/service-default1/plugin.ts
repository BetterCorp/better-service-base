import { ServiceCallable } from "../../service/base";
import { ServicesBase } from "../../service/service";
import { ServicesClient } from "../../service/serviceClient";

export interface testCallable extends ServiceCallable {
  callableMethod(a: number, b: number): Promise<number>;
}

export interface testEvents extends ServiceCallable {
  onReceivable(a: number, b: number): Promise<void>;
}
export interface testEmitEvents extends ServiceCallable {
  onEmittable(a: number, b: number): Promise<void>;
}

export interface testRetEvents extends ServiceCallable {
  onReturnable(a: number, b: number): Promise<number>;
}
export interface testEmitRetEvents extends ServiceCallable {
  onReverseReturnable(a: number, b: number): Promise<number>;
}

export class Service
  extends ServicesBase<
    testEvents,
    testEmitEvents,
    testRetEvents,
    testEmitRetEvents,
    testCallable,
    any
  >
  implements testCallable
{
  async callableMethod(a: number, b: number): Promise<number> {
    await this.log.warn("RECEIVED CALL ({a},{b})", { a, b });
    this.emitEvent("onEmittable", a, b);
    return a * b;
  }
  public override async init() {
    const self = this;
    this.onEvent("onReceivable", async (a: number, b: number) => {
      await self.log.warn("received onReceivable ({a},{b}", { a, b });
    });
    this.onReturnableEvent("onReturnable", async (a: number, b: number) => {
      await self.log.warn("RECEIVED onReturnable ({a},{b})", { a, b });
      let result = await self.emitEventAndReturn("onReverseReturnable", a, b);
      await self.log.warn("RETURNED onReverseReturnable ({result})", { result });
      return result;
    });
  }
}

export class testClient extends ServicesClient<
  testEvents,
  testEmitEvents,
  testRetEvents,
  testEmitRetEvents,
  testCallable,
  any
> {
  public readonly _pluginName: string = "service-default1";
  constructor(
    self: ServicesBase<testEvents, testRetEvents, testCallable, any>
  ) {
    super(self);
  }
  public async init(): Promise<void> {
    const self = this;
    this._plugin.onEvent("onEmittable", async (a: number, b: number) => {
      await self._plugin.log.warn("onEmittable ({a},{b})", { a, b });
    });
    this._plugin.onReturnableEvent(
      "onReverseReturnable",
      async (a: number, b: number) => {
        await self._plugin.log.warn("onReverseReturnable ({a},{b})", { a, b });
        return a * b;
      }
    );
    this._plugin.emitEvent("onReceivable", 56, 7);
  }
  async abc(): Promise<void> {
    await this._plugin.log.warn("TESTING ABC CALL ({result})", {
      result: await this._plugin.callPluginMethod("callableMethod", 5, 8),
    });
    await this._plugin.log.warn("TESTING onReturnable ({result})", {
      result: await this._plugin.emitEventAndReturn("onReturnable", 12, 8),
    });
  }
}
