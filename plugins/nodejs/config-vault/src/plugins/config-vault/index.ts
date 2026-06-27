import * as av from 'anyvali';
import {
  BSBConfig,
  type BSBConfigConstructor,
  BSBError,
  type EventsConfig,
  type Observable,
  type ObservableConfig,
  type PluginDefinition,
  type PluginType,
  PluginTypes,
  Tools,
  createConfigSchema,
} from '@bsb/base';
import type { RuntimePluginDefinition, VaultRuntimeConfig } from '../service-config-vault/types.js';

const ConfigSchema = av.object({
  vaultUrl: av.string().minLength(1).describe('Vault service base URL'),
  apiKeyId: av.string().minLength(1).describe('Vault runtime API key id'),
  apiSecret: av.string().minLength(1).describe('Vault runtime API secret'),
  timeoutMs: av.int32().min(1000).default(5000).describe('Vault HTTP request timeout in milliseconds'),
  allowInsecureHttp: av.bool().default(false).describe('Allow http:// Vault URLs for local development only'),
}).describe('Vault config plugin settings');

export const Config = createConfigSchema(
  {
    name: 'config-vault',
    description: 'Managed BSB config plugin that loads latest active config from Vault',
    image: '../../../docs/public/assets/images/bsb-logo.png',
    tags: ['vault', 'config', 'managed', 'runtime'],
    documentation: ['./docs/config-vault.md'],
  },
  ConfigSchema
);

interface RuntimeResolveResponse {
  application: string;
  group: string;
  profile: string;
  version: number;
  config: VaultRuntimeConfig;
}

export class Plugin extends BSBConfig<InstanceType<typeof Config>> {
  static Config = Config;

  private appConfig!: VaultRuntimeConfig;
  private deploymentProfile = 'default';

  constructor(config: BSBConfigConstructor<InstanceType<typeof Config>>) {
    super(config);
  }

  async init(obs: Observable): Promise<void> {
    const url = new URL('/runtime/config', this.config.vaultUrl);
    if (url.protocol !== 'https:' && !this.config.allowInsecureHttp) {
      throw new BSBError(obs.trace, 'config-vault requires https Vault URLs unless allowInsecureHttp is true');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-vault-key-id': this.config.apiKeyId,
          'x-vault-secret': this.config.apiSecret,
        },
        signal: controller.signal,
      });
    } catch (error) {
      throw new BSBError(obs.trace, 'Failed to fetch Vault config: {error}', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new BSBError(obs.trace, 'Vault config fetch failed with HTTP {status}', {
        status: response.status,
      });
    }

    const parsed = await response.json() as unknown;
    const resolved = parseRuntimeResolve(parsed, obs);
    this.deploymentProfile = resolved.profile;
    this.appConfig = resolved.config;

    if (Tools.isNullOrUndefined(this.appConfig[this.deploymentProfile])) {
      throw new BSBError(obs.trace, 'Vault returned no config for deployment profile ({deploymentProfile})', {
        deploymentProfile: this.deploymentProfile,
      });
    }

    this.appConfig[this.deploymentProfile] = {
      observable: {},
      events: {},
      services: {},
      ...this.appConfig[this.deploymentProfile],
    };
    this.getRequiredServices(obs);
    obs.log.info('Loaded Vault config {application}/{group}/{profile}@{version}', {
      application: resolved.application,
      group: resolved.group,
      profile: resolved.profile,
      version: resolved.version,
    });
  }

  async getServicePluginDefinition(
    obs: Observable,
    pluginName: string,
  ): Promise<{ name: string; enabled: boolean }> {
    const services = this.appConfig[this.deploymentProfile].services ?? {};
    const keydWithMap = Object.keys(services).map((key) => ({
      mappedName: key,
      ...services[key],
    }));
    const enabledPlugin = keydWithMap.find((plugin) => plugin.plugin === pluginName && plugin.enabled === true);
    if (enabledPlugin) return { name: enabledPlugin.mappedName, enabled: enabledPlugin.enabled };
    const plugin = keydWithMap.find((item) => item.plugin === pluginName);
    if (plugin) return { name: plugin.mappedName, enabled: plugin.enabled };
    throw new BSBError(obs.trace, 'Cannot find the plugin {plugin} in the Vault config', {
      plugin: pluginName,
    });
  }

  async getObservablePlugins(_obs: Observable): Promise<Record<string, ObservableConfig>> {
    return mapEnabledPlugins(this.appConfig[this.deploymentProfile].observable ?? {});
  }

  async getEventsPlugins(_obs: Observable): Promise<Record<string, EventsConfig>> {
    return mapEnabledPlugins(this.appConfig[this.deploymentProfile].events ?? {});
  }

  async getServicePlugins(obs: Observable): Promise<Record<string, PluginDefinition>> {
    return mapEnabledPlugins(this.getRequiredServices(obs));
  }

  async getPluginConfig(
    _obs: Observable,
    pluginType: PluginType,
    plugin: string,
  ): Promise<object | null> {
    if (pluginType === PluginTypes.config) return null;
    let configKey: 'services' | 'observable' | 'events' = 'services';
    if (pluginType === PluginTypes.events) configKey = 'events';
    if (pluginType === PluginTypes.observable) configKey = 'observable';
    const pluginConfig = this.appConfig[this.deploymentProfile][configKey]?.[plugin]?.config;
    return Tools.isNullOrUndefined(pluginConfig) ? {} : pluginConfig;
  }

  async getPlugins(): Promise<{ npmPackage: string | undefined | null; plugin: string; name: string; enabled: boolean }[]> {
    const services = this.getRequiredServices();
    return Object.keys(services).map((name) => ({
      npmPackage: services[name].package,
      plugin: services[name].plugin,
      name,
      enabled: services[name].enabled === true,
    }));
  }

  dispose(): void {
    this.appConfig = undefined!;
  }

  private getRequiredServices(obs?: Observable): Record<string, RuntimePluginDefinition> {
    const services = this.appConfig[this.deploymentProfile].services ?? {};
    const enabledServices = Object.keys(services).filter((key) => services[key].enabled === true);
    if (enabledServices.length === 0) {
      const message = 'No enabled service plugins found in Vault deployment profile ({deploymentProfile}); at least one service is required.';
      if (obs) {
        throw new BSBError(obs.trace, message, { deploymentProfile: this.deploymentProfile });
      }
      throw new Error(message.replace('{deploymentProfile}', this.deploymentProfile));
    }
    return services;
  }
}

function mapEnabledPlugins<T extends PluginDefinition | EventsConfig | ObservableConfig>(
  plugins: Record<string, RuntimePluginDefinition>,
): Record<string, T> {
  return Object.keys(plugins)
    .filter((key) => plugins[key].enabled === true)
    .reduce((acc, key) => {
      acc[key] = {
        version: plugins[key].version,
        plugin: plugins[key].plugin,
        package: plugins[key].package,
        enabled: plugins[key].enabled,
        filter: plugins[key].filter,
      } as T;
      return acc;
    }, {} as Record<string, T>);
}

function parseRuntimeResolve(input: unknown, obs: Observable): RuntimeResolveResponse {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new BSBError(obs.trace, 'Invalid Vault response: expected object');
  }
  const value = input as Record<string, unknown>;
  if (typeof value.profile !== 'string' || typeof value.application !== 'string' || typeof value.group !== 'string') {
    throw new BSBError(obs.trace, 'Invalid Vault response: missing application, group, or profile');
  }
  if (typeof value.version !== 'number') {
    throw new BSBError(obs.trace, 'Invalid Vault response: missing numeric version');
  }
  if (typeof value.config !== 'object' || value.config === null || Array.isArray(value.config)) {
    throw new BSBError(obs.trace, 'Invalid Vault response: missing config object');
  }
  return {
    application: value.application,
    group: value.group,
    profile: value.profile,
    version: value.version,
    config: value.config as VaultRuntimeConfig,
  };
}
