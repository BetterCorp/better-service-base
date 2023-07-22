import { ServicesBase } from '../src/index' //"@bettercorp/service-base";
import { PluginConfig } from './sec.config';

export class Plugin extends ServicesBase<PluginConfig> {
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