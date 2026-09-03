import * as av from 'anyvali';
import { createCipheriv, createDecipheriv, createHash, scryptSync, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
  apiSecret: av.string().minLength(1).describe('Vault runtime API secret', { sensitive: true, writeonly: true }),
  cacheDir: av.optional(av.string().minLength(1).describe('Directory for the encrypted last-known-good config cache')),
  timeoutMs: av.int32().coerce({ from: 'string' }).min(1000).default(5000).describe('Vault HTTP request timeout in milliseconds'),
  staleAllowedHours: av.int32().coerce({ from: 'string' }).min(0).default(24).describe('Maximum age in hours for encrypted last-known-good config; 0 disables fallback'),
  allowInsecureHttp: av.bool().coerce({ from: 'string' }).default(false).describe('Allow http:// Vault URLs for local development only'),
  BSB_CONFIG_OVERRIDES: av.optional(av.string().maxLength(128 * 1024).describe('JSON runtime overrides permitted by the active Vault deployment profile', { sensitive: true, writeonly: true })),
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

interface CachedRuntimeConfig {
  fetchedAt: string;
  vaultOrigin: string;
  keyId: string;
  response: RuntimeResolveResponse;
}

const STARTUP_BUDGET_MS = 15_000;

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

    try {
      const resolved = await this.fetchWithRetry(url, obs);
      this.applyResolved(resolved, obs);
      await this.writeCache(url, resolved).catch((error: unknown) => {
        obs.log.warn('Vault config loaded but encrypted cache could not be updated: {error}', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
      return;
    } catch (error) {
      if (!(error instanceof RetryableVaultError) || this.config.staleAllowedHours === 0) throw error;
      const cached = await this.readCache(url, obs);
      this.applyResolved(cached.response, obs);
      obs.log.warn('Vault unavailable after {budgetMs}ms; using encrypted cached config {application}/{group}/{profile}@{version} from {fetchedAt}: {error}', {
        budgetMs: STARTUP_BUDGET_MS,
        application: cached.response.application,
        group: cached.response.group,
        profile: cached.response.profile,
        version: cached.response.version,
        fetchedAt: cached.fetchedAt,
        error: error.message,
      });
    }
  }

  private async fetchWithRetry(url: URL, obs: Observable): Promise<RuntimeResolveResponse> {
    const deadline = Date.now() + STARTUP_BUDGET_MS;
    let lastError = new RetryableVaultError('Vault request failed');
    for (let attempt = 1; Date.now() < deadline; attempt += 1) {
      const remaining = deadline - Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.min(this.config.timeoutMs, remaining));
      try {
        const response = await fetch(url, {
          method: 'GET',
          redirect: 'manual',
          headers: await this.vaultHeaders(false),
          signal: controller.signal,
        });
        if (this.shouldRefreshVaultAuth(response.status)) {
          const retry = await fetch(url, {
            method: 'GET',
            redirect: 'manual',
            headers: await this.vaultHeaders(true),
            signal: controller.signal,
          });
          if (retry.ok) {
            let parsed: unknown;
            try {
              parsed = await retry.json();
            } catch {
              throw new BSBError(obs.trace, 'Invalid Vault response: expected JSON');
            }
            return parseRuntimeResolve(parsed, obs);
          }
          throw new BSBError(obs.trace, 'Vault config fetch failed with HTTP {status}', { status: retry.status });
        }
        if ([429, 502, 503, 504].includes(response.status)) {
          lastError = new RetryableVaultError(`Vault config fetch failed with HTTP ${response.status}`);
        } else if (response.status >= 300 && response.status < 400) {
          throw new BSBError(obs.trace, 'Vault config fetch refused HTTP redirect {status}', { status: response.status });
        } else if (!response.ok) {
          throw new BSBError(obs.trace, 'Vault config fetch failed with HTTP {status}', { status: response.status });
        } else {
          let parsed: unknown;
          try {
            parsed = await response.json();
          } catch {
            throw new BSBError(obs.trace, 'Invalid Vault response: expected JSON');
          }
          return parseRuntimeResolve(parsed, obs);
        }
      } catch (error) {
        if (error instanceof BSBError) throw error;
        lastError = new RetryableVaultError(error instanceof Error ? error.message : String(error));
      } finally {
        clearTimeout(timeout);
      }
      const delayMs = Math.min(250 * attempt, 1_000, Math.max(0, deadline - Date.now()));
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    throw lastError;
  }

  protected async vaultHeaders(_forceRefresh: boolean): Promise<HeadersInit> {
    return {
      'x-vault-key-id': this.config.apiKeyId,
      'x-vault-secret': this.config.apiSecret,
    };
  }

  protected shouldRefreshVaultAuth(_status: number): boolean {
    return false;
  }

  private applyResolved(resolved: RuntimeResolveResponse, obs: Observable): void {
    this.deploymentProfile = resolved.profile;
    this.appConfig = applyEnvironmentOverrides(resolved.config, resolved.profile, this.config.BSB_CONFIG_OVERRIDES, obs);

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

  private async writeCache(url: URL, response: RuntimeResolveResponse): Promise<void> {
    const directory = this.cacheDirectory;
    const path = this.cachePath(directory, url);
    const temp = `${path}.${process.pid}.tmp`;
    const payload: CachedRuntimeConfig = {
      fetchedAt: new Date().toISOString(),
      vaultOrigin: url.origin,
      keyId: this.config.apiKeyId,
      response,
    };
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.cacheKey(url), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    await mkdir(directory, { recursive: true });
    await writeFile(temp, JSON.stringify({
      iv: iv.toString('base64url'),
      authTag: cipher.getAuthTag().toString('base64url'),
      payload: encrypted.toString('base64url'),
    }), { encoding: 'utf8', mode: 0o600 });
    await rename(temp, path);
    await chmod(path, 0o600).catch(() => undefined);
  }

  private async readCache(url: URL, obs: Observable): Promise<CachedRuntimeConfig> {
    try {
      const raw = JSON.parse(await readFile(this.cachePath(this.cacheDirectory, url), 'utf8')) as Record<string, unknown>;
      const decipher = createDecipheriv('aes-256-gcm', this.cacheKey(url), Buffer.from(String(raw.iv), 'base64url'));
      decipher.setAuthTag(Buffer.from(String(raw.authTag), 'base64url'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(String(raw.payload), 'base64url')),
        decipher.final(),
      ]);
      const cached = JSON.parse(decrypted.toString('utf8')) as CachedRuntimeConfig;
      if (cached.vaultOrigin !== url.origin || cached.keyId !== this.config.apiKeyId) throw new Error('cache binding mismatch');
      const ageMs = Date.now() - Date.parse(cached.fetchedAt);
      if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > this.config.staleAllowedHours * 60 * 60 * 1000) {
        throw new Error('cache expired');
      }
      cached.response = parseRuntimeResolve(cached.response, obs);
      return cached;
    } catch (error) {
      throw new BSBError(obs.trace, 'Vault is unavailable and no valid cached config can be used: {error}', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private cacheKey(url: URL): Buffer {
    return scryptSync(this.config.apiSecret, `${url.origin}\0${this.config.apiKeyId}`, 32);
  }

  private get cacheDirectory(): string {
    return this.config.cacheDir ?? join(this.cwd, '.bsb', 'config-vault');
  }

  private cachePath(directory: string, url: URL): string {
    const binding = createHash('sha256').update(`${url.origin}\0${this.config.apiKeyId}`).digest('hex');
    return join(directory, `${binding}.json`);
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
    if (enabledPlugin) return { name: enabledPlugin.mappedName, enabled: enabledPlugin.enabled ?? false };
    const plugin = keydWithMap.find((item) => item.plugin === pluginName);
    if (plugin) return { name: plugin.mappedName, enabled: plugin.enabled ?? false };
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

class RetryableVaultError extends Error {}

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
  if (![value.profile, value.application, value.group].every((item) => typeof item === 'string' && item.length > 0 && item.length <= 100)) {
    throw new BSBError(obs.trace, 'Invalid Vault response: missing application, group, or profile');
  }
  if (!Number.isSafeInteger(value.version) || (value.version as number) < 1) {
    throw new BSBError(obs.trace, 'Invalid Vault response: missing numeric version');
  }
  if (typeof value.config !== 'object' || value.config === null || Array.isArray(value.config)) {
    throw new BSBError(obs.trace, 'Invalid Vault response: missing config object');
  }
  const application = value.application as string;
  const group = value.group as string;
  const profile = value.profile as string;
  const version = value.version as number;
  return {
    application,
    group,
    profile,
    version,
    config: value.config as VaultRuntimeConfig,
  };
}

function applyEnvironmentOverrides(
  config: VaultRuntimeConfig,
  profile: string,
  raw: string | undefined,
  obs: Observable,
): VaultRuntimeConfig {
  if (!raw) return config;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw overrideError(obs, 'expected valid JSON');
  }
  assertSafeOverrideValue(parsed, obs);
  if (!isPlainObject(parsed)) throw overrideError(obs, 'expected an object');
  const unknownSection = Object.keys(parsed).find((key) => !['services', 'events', 'observable'].includes(key));
  if (unknownSection) throw overrideError(obs, `unknown section ${unknownSection}`);

  const output = structuredClone(config);
  const deployment = output[profile];
  if (!deployment) throw overrideError(obs, `profile ${profile} was not returned by Vault`);
  let applied = 0;
  for (const sectionName of ['services', 'events', 'observable'] as const) {
    const sectionOverrides = parsed[sectionName];
    if (sectionOverrides === undefined) continue;
    if (!isPlainObject(sectionOverrides)) throw overrideError(obs, `${sectionName} must be an object`);
    const section = deployment[sectionName] ?? {};
    for (const [name, values] of Object.entries(sectionOverrides)) {
      const plugin = section[name];
      if (!plugin) throw overrideError(obs, `${sectionName}.${name} is not configured`);
      if (!isPlainObject(values)) throw overrideError(obs, `${sectionName}.${name} must be an object`);
      if (!Array.isArray(plugin.envOverridePaths) || plugin.envOverridePaths.some((path) => typeof path !== 'string' || !path)) {
        throw overrideError(obs, `${sectionName}.${name} does not allow environment overrides`);
      }
      const patch: Record<string, unknown> = {};
      applied += collectOverrideValues(values, new Set(plugin.envOverridePaths), '', patch, obs, `${sectionName}.${name}`);
      plugin.config = mergeConfig(plugin.config ?? {}, patch);
    }
  }
  obs.log.info('Applied {count} environment config override(s) from BSB_CONFIG_OVERRIDES', { count: applied });
  return output;
}

function collectOverrideValues(
  source: Record<string, unknown>,
  allowed: Set<string>,
  prefix: string,
  output: Record<string, unknown>,
  obs: Observable,
  pluginPath: string,
): number {
  let count = 0;
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (allowed.has(path)) {
      setOverrideValue(output, path, structuredClone(value));
      count += 1;
    } else if (isPlainObject(value)) {
      count += collectOverrideValues(value, allowed, path, output, obs, pluginPath);
    } else {
      throw overrideError(obs, `${pluginPath}.${path} is not declared as overrideable`);
    }
  }
  return count;
}

function setOverrideValue(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = target;
  for (const part of parts.slice(0, -1)) {
    if (!isPlainObject(current[part])) current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

function mergeConfig(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const output = structuredClone(base);
  for (const [key, value] of Object.entries(patch)) {
    output[key] = isPlainObject(output[key]) && isPlainObject(value)
      ? mergeConfig(output[key] as Record<string, unknown>, value)
      : structuredClone(value);
  }
  return output;
}

function assertSafeOverrideValue(value: unknown, obs: Observable): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > 10_000 || current.depth > 64) throw overrideError(obs, 'payload is too complex');
    if (Array.isArray(current.value)) {
      for (const item of current.value) stack.push({ value: item, depth: current.depth + 1 });
      continue;
    }
    if (!isPlainObject(current.value)) continue;
    for (const [key, item] of Object.entries(current.value)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        throw overrideError(obs, 'payload contains a forbidden key');
      }
      stack.push({ value: item, depth: current.depth + 1 });
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function overrideError(obs: Observable, reason: string): Error {
  return new BSBError(obs.trace, 'Invalid BSB_CONFIG_OVERRIDES: {reason}', { reason });
}
