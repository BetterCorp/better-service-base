import { CPlugin, CPluginClient } from "../ILib";
import { MyPluginConfig } from './sec.config';

export class demo extends CPluginClient<any> {
  public readonly _pluginName: string = "demo";

  triggerServerOnEvent(data: any): void {
    this.refPlugin.emitEvent(this.pluginName, "exampleOnEvent", data);
  }
  triggerServerMethod(data: any): Promise<any> {
    return this.refPlugin.emitEventAndReturn(this.pluginName, "exampleServerMethod", data);
  }
}

export class Plugin extends CPlugin<MyPluginConfig> {
  init(): Promise<void> {
    const self = this;
    return new Promise((resolve) => {
      self.onEvent(self.pluginName, "exampleOnEvent", self.exampleOnEvent);
      self.onReturnableEvent(self.pluginName, "exampleServerMethod", self.exampleServerMethod);
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