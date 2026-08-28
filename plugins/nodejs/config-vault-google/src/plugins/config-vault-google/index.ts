import * as av from 'anyvali';
import { BSBError, createConfigSchema, createFakeDTrace } from '@bsb/base';
import { Plugin as VaultPlugin } from '@bsb/config-vault';
import { GoogleAuth, type IdTokenClient } from 'google-auth-library';

const ConfigSchema = av.object({
  vaultUrl: av.string().minLength(1).describe('Vault service base URL'),
  googleAudience: av.string().minLength(1).describe('Cloud Run service URL used as Google ID token audience'),
  apiKeyId: av.string().minLength(1).describe('Vault runtime API key id'),
  apiSecret: av.string().minLength(1).describe('Vault runtime API secret', { sensitive: true, writeonly: true }),
  timeoutMs: av.int32().coerce({ from: 'string' }).min(1000).default(5000).describe('Vault HTTP request timeout in milliseconds'),
  staleAllowedHours: av.int32().coerce({ from: 'string' }).min(0).default(24).describe('Maximum age in hours for encrypted last-known-good config; 0 disables fallback'),
  allowInsecureHttp: av.bool().coerce({ from: 'string' }).default(false).describe('Allow http:// Vault URLs for local development only'),
}).describe('Google authenticated Vault config plugin settings');

export const Config = createConfigSchema(
  {
    name: 'config-vault-google',
    description: 'Managed BSB config plugin that loads Vault config with Google Cloud Run authentication',
    image: '../../../docs/public/assets/images/bsb-logo.png',
    tags: ['vault', 'config', 'managed', 'runtime', 'google', 'cloud-run'],
    documentation: ['./README.md'],
  },
  ConfigSchema
);

export class Plugin extends VaultPlugin {
  static Config = Config;

  private auth = new GoogleAuth();
  private idTokenClient?: IdTokenClient;

  protected override async vaultHeaders(forceRefresh: boolean): Promise<HeadersInit> {
    return {
      ...await super.vaultHeaders(forceRefresh),
      'X-Serverless-Authorization': `Bearer ${await this.googleIdToken(forceRefresh)}`,
    };
  }

  protected override shouldRefreshVaultAuth(status: number): boolean {
    return status === 401 || status === 403;
  }

  protected async googleIdToken(forceRefresh: boolean): Promise<string> {
    if (forceRefresh) this.idTokenClient = undefined;
    try {
      this.idTokenClient ??= await this.auth.getIdTokenClient(this.googleAudience);
      const authorization = (await this.idTokenClient.getRequestHeaders()).get('authorization');
      if (!authorization?.startsWith('Bearer ')) throw new Error('missing bearer token');
      return authorization.slice('Bearer '.length);
    } catch (error) {
      throw new BSBError(createFakeDTrace('config-vault-google', 'googleIdToken'), 'Google ID token acquisition failed: {error}', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private get googleAudience(): string {
    return (this.config as typeof this.config & { googleAudience: string }).googleAudience;
  }
}
