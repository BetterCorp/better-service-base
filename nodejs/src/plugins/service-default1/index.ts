import { BSBServiceClient } from "../../";
import { Plugin } from "./plugin";

export class testClient extends BSBServiceClient<Plugin> {
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
        console.log("called: " + this.count);
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
