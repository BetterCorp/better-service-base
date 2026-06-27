import * as av from 'anyvali';
import {
  BSBService,
  type BSBServiceConstructor,
  type Observable,
  bsb,
  createConfigSchema,
  createEventSchemas,
  createReturnableEvent,
} from '@bsb/base';
import { loadMasterKey, newToken } from './crypto.js';
import { VaultHttpServer } from './http-server.js';
import { VaultStore } from './store.js';
import { VaultService } from './vault.js';

export const VaultServiceConfigSchema = av.object({
  host: av.string().default('0.0.0.0').describe('HTTP bind host'),
  port: av.int32().min(1).max(65535).default(8080).describe('HTTP port for Vault admin UI and API'),
  publicUrl: av.string().default('http://localhost:8080').describe('External URL used for admin and passkey flows'),
  production: av.bool().default(false).describe('Enable production cookie/security checks'),
  databaseUrl: av.string().minLength(1).describe('Postgres connection string'),
  masterKey: av.string().minLength(1).describe('Base64 encoded 32-byte Vault master key'),
  registryUrl: av.string().default('https://io.bsbcode.dev').describe('BSB registry URL used for plugin catalog search/import'),
}).describe('Vault service configuration');

export type VaultServiceConfig = av.Infer<typeof VaultServiceConfigSchema>;

const RuntimeConfigResponse = bsb.object({
  application: bsb.string({ description: 'Bound application name' }),
  group: bsb.string({ description: 'Bound service group name' }),
  profile: bsb.string({ description: 'Bound deployment profile name' }),
  version: bsb.int32({ min: 1, description: 'Active config version' }),
  config: bsb.unknown('Resolved BSB runtime config object'),
}, 'Resolved runtime config response');

export const EventSchemas = createEventSchemas({
  onReturnableEvents: {
    'vault.runtime.resolve': createReturnableEvent(
      bsb.object({
        keyId: bsb.string({ min: 1, description: 'Vault runtime API key id' }),
        secret: bsb.string({ min: 1, description: 'Vault runtime API secret' }),
      }, 'Vault runtime config resolve request'),
      RuntimeConfigResponse,
      'Resolve latest active BSB config for a runtime API key'
    ),
  },
});

export const Config = createConfigSchema(
  {
    name: 'Vault',
    description: 'Secure BSB managed configuration service with Postgres, admin UI, plugin catalog, and runtime API keys',
    image: '../../../docs/public/assets/images/bsb-logo.png',
    tags: ['vault', 'config', 'security', 'postgres', 'h3', 'admin-ui'],
    documentation: ['./docs/service-config-vault.md'],
  },
  VaultServiceConfigSchema
);

export class Plugin extends BSBService<InstanceType<typeof Config>, typeof EventSchemas> {
  static Config = Config;
  static EventSchemas = EventSchemas;

  public readonly initBeforePlugins?: string[] | undefined;
  public readonly initAfterPlugins?: string[] | undefined;
  public readonly runBeforePlugins?: string[] | undefined;
  public readonly runAfterPlugins?: string[] | undefined;

  private readonly setupCode: string;
  private readonly store: VaultStore;
  private readonly vault: VaultService;
  private httpServer?: VaultHttpServer;

  constructor(config: BSBServiceConstructor<InstanceType<typeof Config>, typeof EventSchemas>) {
    super({
      ...config,
      eventSchemas: EventSchemas,
    });

    this.setupCode = newToken(18);
    this.store = new VaultStore(this.config.databaseUrl);
    this.vault = new VaultService({
      store: this.store,
      masterKey: loadMasterKey(this.config.masterKey),
      setupCode: this.setupCode,
      publicUrl: this.config.publicUrl,
    });
  }

  async init(obs: Observable): Promise<void> {
    obs.log.info('Initializing Vault service');
    await this.store.init();
    if (await this.vault.setupRequired()) {
      obs.log.warn('Vault first admin setup required. Setup code: {setupCode}', {
        setupCode: this.setupCode,
      });
    }
    await this.events.onReturnableEvent('vault.runtime.resolve', obs, async (eventObs, payload) => {
      return this.vault.resolveRuntimeConfig(payload.keyId, payload.secret, eventObs);
    });
    this.httpServer = new VaultHttpServer({
      host: this.config.host,
      port: this.config.port,
      publicUrl: this.config.publicUrl,
      registryUrl: this.config.registryUrl,
      production: this.config.production,
      obs,
      vault: this.vault,
    });
  }

  async run(obs: Observable): Promise<void> {
    if (!this.httpServer) throw new Error('Vault HTTP server was not initialized');
    await this.httpServer.start();
    obs.log.info('Vault admin UI/API started on {host}:{port}', {
      host: this.config.host,
      port: this.config.port,
    });
  }

  async dispose(): Promise<void> {
    await this.httpServer?.stop();
    await this.store.close();
  }
}
