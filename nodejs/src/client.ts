import {
  BSBConfig,
  BSBService,
  BSBServiceClient,
  BSBServiceConstructor,
} from "./base";
import { LoggingConfig, EventsConfig, PluginDefition, PluginType, DEBUG_MODE } from './interfaces';
import { SBLogging, ServiceBase } from "./serviceBase";
import {Plugin as DefaultConfig} from './plugins/config-default/plugin';

export class SBClient<Client extends BSBServiceClient> {
  private serviceBase: ServiceBase;
  public client!: Client;

  private useDefaultConfigPlugin: boolean;
  constructor(useDefaultConfigPlugin: boolean = false) {
    this.useDefaultConfigPlugin = useDefaultConfigPlugin;
    const CWD = process.env.APP_DIR || process.cwd();
    this.serviceBase = new ServiceBase(false, true, CWD);
  }

  public async initAndRun(client: typeof BSBServiceClient, ...args: any[]) {
    if (!this.useDefaultConfigPlugin)
      this.serviceBase.setConfigPlugin("config-bsb-internal-client", FakeServiceConfig);
    
    const service = this.serviceBase.addService(
      "service-bsb-internal-client",
      FakeServiceClient,
      {}
    );
    this.client = new (client as any)(service, ...args);

    await this.serviceBase.init();
    await this.serviceBase.run();
  }
}

class FakeServiceClient extends BSBService<any> {
  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public methods = {};
  dispose?(): void;
  init?(): void | Promise<void> {
    throw new Error("Method not implemented.");
  }
  run?(): void | Promise<void> {
    throw new Error("Method not implemented.");
  }
  constructor(config: BSBServiceConstructor) {
    super(config);
  }
}

class FakeServiceConfig extends BSBConfig {
  private config: DefaultConfig;
  constructor(appId: string, mode: DEBUG_MODE, pluginName: string, cwd: string, pluginCwd: string, logging: SBLogging) {
    super(appId, mode, pluginName, cwd, pluginCwd, logging)
    this.config = new DefaultConfig(appId, mode, pluginName, cwd, pluginCwd, logging);
  }
  async getLoggingPlugins(): Promise<Record<string, LoggingConfig>> {
    return this.config.getLoggingPlugins();
  }
  async getEventsPlugins(): Promise<Record<string, EventsConfig>> {
    return this.config.getEventsPlugins();
  }
  async getServicePlugins(): Promise<Record<string, PluginDefition>> {
    return this.config.getServicePlugins();
  }
  async getServicePluginDefinition(pluginName: string): Promise<{ name: string; enabled: boolean; }> {
    return this.config.getServicePluginDefinition(pluginName);
  }
  async getPluginConfig(pluginType: PluginType, plugin: string): Promise<object | null> {
    return this.config.getPluginConfig(pluginType, plugin);
  }
  dispose() {
    this.config.dispose();
  }
  init() {
    this.config.init();
  }
}
