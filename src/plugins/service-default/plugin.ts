import { ServiceCallable } from "../../service/base";
import { ServicesBase } from "../../service/service";
import { ServicesClient } from "../../service/serviceClient";

export interface testCallable extends ServiceCallable {
  abc(a: boolean): Promise<void>;
}

export interface testEvents extends ServiceCallable {
  abcd(a: boolean): Promise<void>;
}
export interface testEmitEvents extends ServiceCallable {
  //abcd(a: boolean): Promise<void>;
}

export interface testRetEvents extends ServiceCallable {
  abcdx(a: boolean): Promise<boolean>;
}
export interface testEmitRetEvents extends ServiceCallable {
  //abcdx(a: boolean): Promise<boolean>;
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
  public override initRequiredPlugins: string[] = ["service-default2"];
  async abc(): Promise<void> {
    this.log.info("RECEIVED CALL");
    //throw new Error("Method not implemented.");
  }
  async init() {
    this.onEvent("abcd", async (a: boolean) => {
      console.log("received:" + a);
      return;
    });
    this.onReturnableEvent("abcdx", async (a: boolean) => {
      return false;
    });
    //this.emitEvent("abcd", true);
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
  public readonly _pluginName: string = "service-default";
  constructor(
    self: ServicesBase<testEvents, testRetEvents, testCallable, any>
  ) {
    super(self);
  }
  public async register(): Promise<void> {
    await this._register();
    this._plugin.emitEvent("abcd", true);
  }
  async abc(a: boolean): Promise<void> {
    this._plugin.log.info("TESTING CALL");
    await this._plugin.callPluginMethod("abc", a);
    //await this._plugin.emitEvent("abcd", a);
    //await this._plugin.emitEventAndReturn("abcdx", a);
  }
}
