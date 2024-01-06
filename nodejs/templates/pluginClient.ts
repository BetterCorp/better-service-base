import { ServicesClient } from '../src/index' //"@bettercorp/service-base";

export class demo extends ServicesClient {
  public readonly pluginName: string = "demo";

  async triggerServerOnEvent(data: any): Promise<void> {
    await this.emitEvent("exampleOnEvent", data);
  }
  async triggerServerMethod(data: any): Promise<any> {
    return this.emitEventAndReturn("exampleServerMethod", data);
  }
}
