import {
  BSBConfig,
  BSBService,
  BSBServiceClient,
  BSBServiceConstructor,
} from "./base";
import {
  LoggingConfig,
  EventsConfig,
  PluginDefition,
  PluginType,
  DEBUG_MODE,
} from "./interfaces";
import { SBLogging, ServiceBase } from "./serviceBase";
import { randomUUID } from "crypto";

export class SBClient<Client extends BSBServiceClient> {
  private serviceBase: ServiceBase;
  public client!: Client;

  private useDefaultConfigPlugin: boolean;
  private configSetup: boolean = false;
  constructor(useDefaultConfigPlugin: boolean = false) {
    this.useDefaultConfigPlugin = useDefaultConfigPlugin;
    const CWD = process.env.APP_DIR || process.cwd();
    this.serviceBase = new ServiceBase(false, true, CWD);
  }

  public async addClient(client: typeof BSBServiceClient, ...args: any[]) {
    if (!this.useDefaultConfigPlugin && !this.configSetup) {
      this.configSetup = true;
      this.serviceBase.setConfigPlugin(
        "config-bsb-internal-client",
        FakeServiceConfig
      );
    }
    const service = this.serviceBase.addService(
      "service-bsb-internal-client-" + randomUUID(),
      FakeServiceClient,
      {}
    );
    return new (client as any)(service, ...args);
  }

  public async init() {
    await this.serviceBase.init();
  }
  public async run() {
    await this.serviceBase.run();
  }
}

export class FakeServiceClient extends BSBService<any> {
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

export class FakeServiceConfig extends BSBConfig {
  constructor(
    appId: string,
    mode: DEBUG_MODE,
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    logging: SBLogging
  ) {
    super(appId, mode, pluginName, cwd, pluginCwd, logging);
  }
  async getLoggingPlugins(): Promise<Record<string, LoggingConfig>> {
    return {};
  }
  async getEventsPlugins(): Promise<Record<string, EventsConfig>> {
    return {};
  }
  async getServicePlugins(): Promise<Record<string, PluginDefition>> {
    return {};
  }
  async getServicePluginDefinition(
    pluginName: string
  ): Promise<{ name: string; enabled: boolean }> {
    return { name: pluginName, enabled: false };
  }
  async getPluginConfig(
    pluginType: PluginType,
    plugin: string
  ): Promise<object | null> {
    return null;
  }
  dispose?(): void;
  init?(): void;
}
