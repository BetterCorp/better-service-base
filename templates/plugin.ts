import { CPlugin, CPluginClient } from "@bettercorp/service-base/lib/ILib";
import { MyPluginConfig } from './sec.config';

export class demo extends CPluginClient<any> {
  public readonly _pluginName: string = "demo";

  async triggerServerOnEvent(data: any): Promise<void> {
    this.refPlugin.emitEvent(null, "exampleOnEvent", data);
  }
  async triggerServerMethod(data: any): Promise<any> {
    return this.refPlugin.emitEventAndReturn(null, "exampleServerMethod", data);
  }
}

export class Plugin extends CPlugin<MyPluginConfig> {
  init(): Promise<void> {
    const self = this;
    return new Promise(async (resolve) => {
      self.onEvent(null, "exampleOnEvent", x => self.exampleOnEvent(x));
      self.onReturnableEvent(null, "exampleServerMethod", (re: any, rj: any, d: any) => self.exampleServerMethod(d).then(re).catch(rj));
      resolve();
    });
  }

  exampleOnEvent(data: any): void {
    this.log.info("Received exampleOnEvent");
  }

  exampleServerMethod = (data: any): Promise<any> => new Promise((resolve, reject) => {
    resolve(data);
  });

  loaded(): Promise<void> {
    const self = this;
    return new Promise((resolve) => {
      self.emitEvent('another-plugin-name', 'another-plugin-on-event', '0');
      resolve();
    });
  }
}