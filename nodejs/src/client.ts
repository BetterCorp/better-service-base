/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2016 - 2025 BetterCorp (PTY) Ltd  
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Alternatively, you may obtain a commercial license for this program. 
 * The commercial license allows you to use the Program in a closed-source manner, 
 * including the right to create derivative works that are not subject to the terms 
 * of the AGPL. 
 *
 * To obtain a commercial license, please contact the copyright holders at 
 * https://www.bettercorp.dev. The terms and conditions of the commercial license 
 * will be provided upon request.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  BSBConfig,
  BSBConfigConstructor,
  BSBService,
  BSBServiceClient,
  BSBServiceConstructor,
  LoggingConfig,
  EventsConfig,
  PluginDefinition,
  PluginType, ServiceBase,
  DTrace,
} from "./index";
import { v7 as randomUUID } from "uuid";

/**
 * @hidden
 * 
 * Old client class - do not use.
 */
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
      await this.serviceBase.addService(
        "config-bsb-internal-client",
        FakeServiceConfig as any,
        {}
      );
    }
    const service = await this.serviceBase.addService(
      "service-bsb-internal-client-" + randomUUID(),
      FakeServiceClient,
      {},
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

/**
 * @hidden
 * 
 * Old client class - do not use.
 */
export class FakeServiceClient
  extends BSBService<null> {
  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
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

/**
 * @hidden
 * 
 * Old config class - do not use.
 */
export class FakeServiceConfig
  extends BSBConfig {
  constructor(config: BSBConfigConstructor) {
    super(config);
  }

  async getLoggingPlugins(): Promise<Record<string, LoggingConfig>> {
    return {};
  }

  async getMetricsPlugins(): Promise<Record<string, PluginDefinition>> {
    return {};
  }

  async getEventsPlugins(): Promise<Record<string, EventsConfig>> {
    return {};
  }

  async getServicePlugins(): Promise<Record<string, PluginDefinition>> {
    return {};
  }

  async getServicePluginDefinition(
    trace: DTrace,
    pluginName: string,
  ): Promise<{ name: string; enabled: boolean }> {
    return { name: pluginName, enabled: false };
  }

  async getPluginConfig(
    trace: DTrace,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    pluginType: PluginType,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    plugin: string,
  ): Promise<object | null> {
    return null;
  }

  dispose?(): void;

  init?(): void;
}
