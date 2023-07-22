import { CPlugin, CPluginClient } from "@bettercorp/service-base/lib/interfaces/plugins";

export class demo extends CPluginClient {
  public readonly pluginName: string = "demo";

  async triggerServerOnEvent(data: any): Promise<void> {
    await this.emitEvent("exampleOnEvent", data);
  }
  async triggerServerMethod(data: any): Promise<any> {
    return this.emitEventAndReturn("exampleServerMethod", data);
  }
}
