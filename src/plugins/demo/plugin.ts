import { CPlugin, CPluginClient } from "../../ILib";

export class demo extends CPluginClient {
  public readonly _pluginName: string = "demo";
  
  setTime(time: number): void {
    this.refPlugin.emitEvent(this.pluginName, 'setTime', time);
  };
  getTime(): Promise<number> {
    return this.refPlugin.emitEventAndReturn(this.pluginName, 'getTime');
  };
}

export class Plugin extends CPlugin {
  // normal plugin
  init(): Promise<void> {
    const self = this;
    return new Promise(resolve => {
      self.onEvent(self.pluginName, 'setTime', self.onTime);
      self.onReturnableEvent(self.pluginName, 'getTime', self.getTime);
      resolve();
    });
  }

  onTime(data: number): void {
    this.log.info(`Received time: ${ new Date(data) }`);
  };

  getTime = (): Promise<number> => new Promise((resolve, reject) => {
    resolve(new Date().getTime());
  });

  // demo of use
  private demo!: demo;
  loaded(): Promise<void> {
    const self = this;
    return new Promise(resolve => {
      self.demo = new demo(self);
      setTimeout(() => {
        // get data from another plugin
        self.demo.getTime()
          .then(self.log.warn)
          .catch(self.log.error);

        // send data to another plugin
        self.demo.setTime(1627602263775);
      }, 2000);
      resolve();
    });
  }
}