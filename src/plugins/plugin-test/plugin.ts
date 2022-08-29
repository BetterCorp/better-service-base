import { PluginCallable } from "../../../src/plugin/base";
import { PluginBase } from "../../../src/plugin/plugin";
import { PluginClient } from "../../../src/plugin/pluginClient";

export interface testCallable extends PluginCallable {
  abc(a: boolean): Promise<void>;
}

export interface testEvents extends PluginCallable {
  abcd(a: boolean): Promise<void>;
}

export interface testRetEvents extends PluginCallable {
  abcdx(a: boolean): Promise<boolean>;
}

export class pluginTest
  extends PluginBase<testEvents, testRetEvents, testCallable, any>
  implements testCallable
{
  async abc(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async init() {
    this.onEvent("abcd", async (a: boolean) => {
      return;
    });
    this.onReturnableEvent("abcdx", async (a: boolean) => {
      return false;
    });
    this.emitEvent("abcd", true);
  }
}

export class testClient extends PluginClient<
  testEvents,
  testRetEvents,
  testCallable,
  any
> {
  public readonly _pluginName: string = "my-plugin";
  constructor(self: PluginBase<testEvents, testRetEvents, testCallable, any>) {
    super(self);
    this.plugin.onEvent("abcd", async (a: boolean) => {
      return;
    });
  }
  async abc(a: boolean): Promise<void> {
    await this.plugin.callPluginMethod("abc", a);
    await this.plugin.emitEvent("abcd", a);
    await this.plugin.emitEventAndReturn("abcdx", a);
  }
}
