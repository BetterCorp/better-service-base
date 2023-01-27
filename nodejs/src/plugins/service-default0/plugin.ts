import { IPluginLogger } from '../../interfaces/logger';
import { ServicesBase } from "../../service/service";
import { testClient } from "../service-default1/plugin";

export class Service extends ServicesBase {
  public override initAfterPlugins: string[] = ["service-default3"];
  private testClient: testClient;
  constructor(pluginName: string, cwd: string, pluginCwd: string, log: IPluginLogger) {
    super(pluginName, cwd, pluginCwd, log);
    this.testClient = new testClient(this);
  }
  public override async init() {
    await this.testClient.init();
  }
  public override async run() {
    await this.testClient.abc();
  }
}
