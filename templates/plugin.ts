import { CPlugin, CPluginClient } from "@bettercorp/service-base/lib/interfaces/plugins";
import { MyPluginConfig } from './sec.config';

export class demo extends CPluginClient<any> {
  public readonly _pluginName: string = "demo";

  async triggerServerOnEvent(data: any): Promise<void> {
    await this.emitEvent("exampleOnEvent", data);
  }
  async triggerServerMethod(data: any): Promise<any> {
    return this.emitEventAndReturn("exampleServerMethod", data);
  }
}

export class Plugin extends CPlugin<MyPluginConfig> {
  async init(): Promise<void> {
    await this.onEvent(null, "exampleOnEvent", x => self.exampleOnEvent(x));
    await this.onReturnableEvent(null, "exampleServerMethod", self.exampleServerMethod);
  }

  async exampleOnEvent(data: any): Promise<void> {
    this.log.info("Received exampleOnEvent");
  }

  async exampleServerMethod(data: any): Promise<any> {
    return data;
  };

  async loaded(): Promise<void> {
    await this.emitEvent('another-plugin-name', 'another-plugin-on-event', '0');
  }
}